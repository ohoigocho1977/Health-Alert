import type {
  Community,
  CommunityDetectionResult,
  FieldVerification,
  HealthReport,
  StatisticalSignal,
  SurveillanceClassification,
  ThresholdConfig,
} from '../src/shared/types.ts';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function runStatisticalDetectionForCommunity(
  community: Community,
  allReports: HealthReport[],
  verifications: FieldVerification[],
  config: ThresholdConfig,
  peerCommunityRates: number[],
  nowMs: number = Date.now()
): CommunityDetectionResult {
  // Exclude reports proven to be false reports by field verification
  const falseReportIds = new Set(
    verifications.filter((v) => v.outcome === 'false_report').map((v) => v.reportId)
  );

  const communityReports = allReports.filter(
    (r) => r.communityId === community.id && !falseReportIds.has(r.id)
  );

  const windowStartMs = nowMs - config.windowHours * 3600 * 1000;
  const baselineStartMs = windowStartMs - config.baselineDays * 24 * 3600 * 1000;

  const recentReports = communityReports.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= windowStartMs && t <= nowMs;
  });

  const baselineReports = communityReports.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= baselineStartMs && t < windowStartMs;
  });

  // Build daily histogram across baselineDays + recent window days
  const totalChartDays = Math.min(14, config.baselineDays);
  const dailyMap = new Map<string, { reports: number; affected: number }>();
  for (let i = totalChartDays - 1; i >= 0; i--) {
    const dayKey = new Date(nowMs - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    dailyMap.set(dayKey, { reports: 0, affected: 0 });
  }
  for (const r of communityReports) {
    const dk = toDayKey(r.createdAt);
    const entry = dailyMap.get(dk);
    if (entry) {
      entry.reports += 1;
      entry.affected += r.affectedCount;
    }
  }

  // Historical daily counts during baseline period
  const baselineDailyCounts: number[] = [];
  for (let d = 0; d < config.baselineDays; d++) {
    const dayKey = new Date(windowStartMs - (d + 1) * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const count = baselineReports.filter((r) => toDayKey(r.createdAt) === dayKey).length;
    baselineDailyCounts.push(count);
  }

  const empiricalMean =
    baselineDailyCounts.length > 0
      ? baselineDailyCounts.reduce((acc, v) => acc + v, 0) / baselineDailyCounts.length
      : community.baselineDailyReports;

  // Blend configured baseline floor with empirical history to avoid zero-division on new pilots
  const baselineDailyMean = Number(Math.max(empiricalMean, community.baselineDailyReports, 0.4).toFixed(2));
  const variance =
    baselineDailyCounts.length > 1
      ? baselineDailyCounts.reduce((acc, v) => acc + (v - baselineDailyMean) ** 2, 0) /
        baselineDailyCounts.length
      : 0.6;
  const stdDev = Math.max(Math.sqrt(variance), 0.65);

  const windowDays = config.windowHours / 24;
  const currentDailyRate = Number((recentReports.length / windowDays).toFixed(2));
  const volumeMultiplier = Number((currentDailyRate / baselineDailyMean).toFixed(2));
  const zScore = Number(((currentDailyRate - baselineDailyMean) / stdDev).toFixed(2));

  const sortedPeers = [...peerCommunityRates].sort((a, b) => a - b);
  const peerMedianDailyRate =
    sortedPeers.length > 0
      ? Number(sortedPeers[Math.floor(sortedPeers.length / 2)].toFixed(2))
      : baselineDailyMean;

  const dailySeries = Array.from(dailyMap.entries()).map(([date, val]) => ({
    date: date.slice(5), // MM-DD
    reports: val.reports,
    baseline: baselineDailyMean,
    affected: val.affected,
  }));

  const signals: StatisticalSignal[] = [];

  // 1. Volume surge signal
  if (
    recentReports.length >= config.minReportsForAnomaly &&
    volumeMultiplier >= config.volumeMultiplierThreshold
  ) {
    signals.push({
      signalType: 'volume_surge',
      label: 'Reporting Volume Surge',
      metricValue: volumeMultiplier,
      thresholdValue: config.volumeMultiplierThreshold,
      unit: 'x baseline',
      description: `${recentReports.length} reports in the last ${config.windowHours}h (${currentDailyRate}/day) vs ${baselineDailyMean}/day baseline (${volumeMultiplier}x).`,
      relatedReportIds: recentReports.map((r) => r.id),
    });
  }

  // 2. Z-score statistical spike
  if (recentReports.length >= config.minReportsForAnomaly && zScore >= config.zScoreThreshold) {
    signals.push({
      signalType: 'z_score_spike',
      label: 'Statistical Z-Score Deviation',
      metricValue: zScore,
      thresholdValue: config.zScoreThreshold,
      unit: 'σ',
      description: `Daily reporting rate exceeds ${config.baselineDays}-day historical mean by ${zScore} standard deviations.`,
      relatedReportIds: recentReports.map((r) => r.id),
    });
  }

  // 3. Spatial cluster detection (Haversine neighborhood)
  let bestCluster: HealthReport[] = [];
  for (const anchor of recentReports) {
    const neighbors = recentReports.filter(
      (candidate) =>
        haversineMeters(anchor.approxLat, anchor.approxLng, candidate.approxLat, candidate.approxLng) <=
        config.clusterRadiusMeters
    );
    if (neighbors.length > bestCluster.length) {
      bestCluster = neighbors;
    }
  }
  if (bestCluster.length >= config.clusterMinReports) {
    const avgLat = bestCluster.reduce((s, r) => s + r.approxLat, 0) / bestCluster.length;
    const avgLng = bestCluster.reduce((s, r) => s + r.approxLng, 0) / bestCluster.length;
    signals.push({
      signalType: 'spatial_cluster',
      label: 'Geographic Report Cluster',
      metricValue: bestCluster.length,
      thresholdValue: config.clusterMinReports,
      unit: 'reports in radius',
      description: `${bestCluster.length} privacy-fuzzed reports fall within a ${config.clusterRadiusMeters}m radius.`,
      relatedReportIds: bestCluster.map((r) => r.id),
      clusterCenter: { lat: Number(avgLat.toFixed(5)), lng: Number(avgLng.toFixed(5)) },
    });
  }

  // 4. Water source convergence
  const sourceGroups = new Map<string, { label: string; reportIds: string[] }>();
  for (const r of recentReports) {
    if (r.suspectedWaterSourceId) {
      const existing = sourceGroups.get(r.suspectedWaterSourceId) ?? {
        label: r.suspectedWaterSourceLabel || r.suspectedWaterSourceId,
        reportIds: [],
      };
      existing.reportIds.push(r.id);
      sourceGroups.set(r.suspectedWaterSourceId, existing);
    }
  }
  for (const [sourceId, grp] of sourceGroups.entries()) {
    if (grp.reportIds.length >= config.waterSourceConcentrationThreshold) {
      signals.push({
        signalType: 'water_source_convergence',
        label: 'Shared Water Source Convergence',
        metricValue: grp.reportIds.length,
        thresholdValue: config.waterSourceConcentrationThreshold,
        unit: 'linked reports',
        description: `${grp.reportIds.length} recent reports independently cite "${grp.label}" as a suspected water source.`,
        relatedReportIds: grp.reportIds,
        suspectedWaterSourceId: sourceId,
        suspectedWaterSourceLabel: grp.label,
      });
    }
  }

  // 5. Clinical severity & waterborne co-symptom escalation
  const severeOrAcute = recentReports.filter(
    (r) =>
      r.severity === 'severe' ||
      (r.symptoms.includes('watery_diarrhoea') && r.symptoms.includes('vomiting')) ||
      r.symptoms.includes('bloody_diarrhoea') ||
      r.symptoms.includes('dehydration_signs')
  );
  if (severeOrAcute.length >= 3) {
    signals.push({
      signalType: 'severity_escalation',
      label: 'Acute Waterborne Symptom Concentration',
      metricValue: severeOrAcute.length,
      thresholdValue: 3,
      unit: 'acute reports',
      description: `${severeOrAcute.length} recent reports include severe presentation, dehydration signs, bloody diarrhoea, or combined watery diarrhoea and vomiting.`,
      relatedReportIds: severeOrAcute.map((r) => r.id),
    });
  }

  // 6. Cross-community divergence
  if (
    recentReports.length >= config.minReportsForAnomaly &&
    peerMedianDailyRate > 0 &&
    currentDailyRate / peerMedianDailyRate >= 2.2
  ) {
    const ratio = Number((currentDailyRate / peerMedianDailyRate).toFixed(2));
    signals.push({
      signalType: 'cross_community_divergence',
      label: 'Localized Divergence vs Peer Communities',
      metricValue: ratio,
      thresholdValue: 2.2,
      unit: 'x peer median',
      description: `Current reporting rate (${currentDailyRate}/day) is ${ratio}x the peer community median (${peerMedianDailyRate}/day), pointing to a localized pattern rather than regional reporting noise.`,
      relatedReportIds: recentReports.map((r) => r.id),
    });
  }

  const verifiedReports = recentReports.filter((r) => r.verificationStatus === 'verified');
  const pendingReports = recentReports.filter(
    (r) => r.verificationStatus === 'pending' || r.verificationStatus === 'under_review'
  );

  // Determine 5-stage classification (AI/statistical engine NEVER assigns officially_confirmed_outbreak)
  let suggestedClassification: SurveillanceClassification = 'individual_reports_only';
  if (verifiedReports.length >= 2 && signals.length >= 2) {
    suggestedClassification = 'human_verified_incident';
  } else if (
    signals.length >= 3 ||
    (signals.some((s) => s.signalType === 'spatial_cluster') &&
      signals.some((s) => s.signalType === 'water_source_convergence'))
  ) {
    suggestedClassification = 'potential_health_threat';
  } else if (signals.length >= 1) {
    suggestedClassification = 'unusual_reporting_activity';
  }

  const traceableReportIds = Array.from(
    new Set(signals.flatMap((s) => s.relatedReportIds))
  );

  return {
    communityId: community.id,
    communityName: community.name,
    recentReportCount: recentReports.length,
    recentAffectedPeople: recentReports.reduce((sum, r) => sum + r.affectedCount, 0),
    baselineDailyMean,
    currentDailyRate,
    volumeMultiplier,
    zScore,
    peerMedianDailyRate,
    verifiedCount: verifiedReports.length,
    pendingCount: pendingReports.length,
    signals,
    suggestedClassification,
    traceableReportIds: traceableReportIds.length > 0 ? traceableReportIds : recentReports.map((r) => r.id),
    dailySeries,
    limitations: [
      `Thresholds (window=${config.windowHours}h, multiplier>=${config.volumeMultiplierThreshold}x, z>=${config.zScoreThreshold}) are configurable operational screening parameters, not clinically validated epidemiological cutoffs.`,
      'Community self-reports may reflect reporting awareness bias, duplicate household submissions, or seasonal non-infectious gastroenteritis.',
      'Spatial clustering operates on privacy-fuzzed coordinates (300m–550m jitter) to protect household anonymity.',
      'Automated signals cannot diagnose individuals or declare a public health outbreak; human field verification and laboratory testing are required.',
    ],
  };
}

export function runDetectionAcrossCommunities(
  communities: Community[],
  allReports: HealthReport[],
  verifications: FieldVerification[],
  config: ThresholdConfig,
  nowMs: number = Date.now()
): CommunityDetectionResult[] {
  const windowStartMs = nowMs - config.windowHours * 3600 * 1000;
  const windowDays = config.windowHours / 24;
  const falseReportIds = new Set(
    verifications.filter((v) => v.outcome === 'false_report').map((v) => v.reportId)
  );

  const ratesByCommunity = communities.map((c) => {
    const count = allReports.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return r.communityId === c.id && !falseReportIds.has(r.id) && t >= windowStartMs && t <= nowMs;
    }).length;
    return count / windowDays;
  });

  return communities.map((c, idx) => {
    const peerRates = ratesByCommunity.filter((_, pIdx) => pIdx !== idx);
    return runStatisticalDetectionForCommunity(c, allReports, verifications, config, peerRates, nowMs);
  });
}
