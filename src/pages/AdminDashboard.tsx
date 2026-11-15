import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Layout } from '../components/Layout';
import {
  StatusTag,
  classificationTagProps,
  verificationTagProps,
} from '../components/StatusText';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import {
  SYMPTOM_LABELS,
  type AlertRecord,
  type CommunityDetectionResult,
  type HealthReport,
  type Investigation,
  type RiskAssessment,
  type SymptomKey,
} from '../shared/types';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { searchQuery, selectedCommunityId } = useGlobalFilter();

  const [detections, setDetections] = useState<CommunityDetectionResult[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [intelRes, repRes, alertRes, invRes] = await Promise.all([
        api.getIntelligenceSummary(),
        api.getReports(),
        api.getAlerts(),
        api.getInvestigations(),
      ]);
      setDetections(intelRes.detections);
      setAssessments(intelRes.assessments);
      setReports(repRes.reports);
      setAlerts(alertRes.alerts);
      setInvestigations(invRes.investigations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopedDetections = useMemo(() => {
    if (!selectedCommunityId) return detections;
    return detections.filter((d) => d.communityId === selectedCommunityId);
  }, [detections, selectedCommunityId]);

  const scopedReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      if (selectedCommunityId && r.communityId !== selectedCommunityId) return false;
      if (!q) return true;
      const symptomText = r.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(' ').toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.communityName.toLowerCase().includes(q) ||
        symptomText.includes(q)
      );
    });
  }, [reports, selectedCommunityId, searchQuery]);

  // Last 24h count & % vs baseline
  const last24hStats = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const recent24h = scopedReports.filter((r) => new Date(r.createdAt).getTime() >= cutoff).length;
    const expectedDaily = scopedDetections.reduce((acc, d) => acc + d.baselineDailyMean, 0) || 1;
    const pctDelta = Math.round(((recent24h - expectedDaily) / expectedDaily) * 100);
    return { count: recent24h, pctDelta };
  }, [scopedReports, scopedDetections]);

  const scopedAwaitingVerification = useMemo(
    () =>
      scopedReports.filter(
        (r) => r.verificationStatus === 'pending' || r.verificationStatus === 'under_review'
      ).length,
    [scopedReports]
  );

  const scopedActiveAlerts = useMemo(
    () =>
      alerts.filter(
        (a) =>
          a.status !== 'resolved' &&
          (!selectedCommunityId || a.communityId === selectedCommunityId)
      ),
    [alerts, selectedCommunityId]
  );

  const highAlertsCount = useMemo(
    () =>
      scopedActiveAlerts.filter(
        (a) => a.severity === 'critical' || a.severity === 'warning'
      ).length,
    [scopedActiveAlerts]
  );

  // Aggregate 14-day series with expected range band [min, max]
  const chartData = useMemo(() => {
    if (scopedDetections.length === 0) return [];
    const dates = scopedDetections[0].dailySeries.map((pt) => pt.date);
    return dates.map((date, idx) => {
      let totalReports = 0;
      let totalBaseline = 0;
      for (const det of scopedDetections) {
        const pt = det.dailySeries[idx];
        if (pt) {
          totalReports += pt.reports;
          totalBaseline += pt.baseline;
        }
      }
      const low = Math.max(0, Number((totalBaseline * 0.65).toFixed(1)));
      const high = Number((totalBaseline * 1.45 + 0.5).toFixed(1));
      return {
        date,
        reports: totalReports,
        expectedRange: [low, high] as [number, number],
      };
    });
  }, [scopedDetections]);

  // Emerging symptom patterns (last 7 days vs overall)
  const symptomBreakdown = useMemo(() => {
    const counts = new Map<SymptomKey, number>();
    const cutoff7d = Date.now() - 7 * 24 * 3600 * 1000;
    const recent = scopedReports.filter((r) => new Date(r.createdAt).getTime() >= cutoff7d);
    const source = recent.length > 0 ? recent : scopedReports;
    for (const rep of source) {
      for (const s of rep.symptoms) {
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        symptom: SYMPTOM_LABELS[key] || key,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [scopedReports]);

  const latestAssessment = useMemo(() => {
    if (selectedCommunityId) {
      return assessments.find((a) => a.communityId === selectedCommunityId) || assessments[0];
    }
    return assessments[0];
  }, [assessments, selectedCommunityId]);

  const scopedInvestigations = useMemo(() => {
    if (!selectedCommunityId) return investigations;
    return investigations.filter((i) => i.communityId === selectedCommunityId);
  }, [investigations, selectedCommunityId]);

  return (
    <Layout title="Overview">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-[#FEE4E2] border border-[#B42318]/30 rounded-[6px] text-[13px] text-[#B42318]">
            {error}
          </div>
        )}

        {/* Row 1: 4 KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Total Health Reports
            </p>
            <p className="mt-2 text-[28px] font-bold text-[#0B1F3A] tabular-nums leading-none">
              {loading ? '—' : scopedReports.length}
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Last 24 Hours
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="text-[28px] font-bold text-[#0B1F3A] tabular-nums leading-none">
                {loading ? '—' : last24hStats.count}
              </span>
              {!loading && last24hStats.pctDelta > 0 && (
                <StatusTag label={`+${last24hStats.pctDelta}%`} tone="elevated" />
              )}
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Awaiting Verification
            </p>
            <p className="mt-2 text-[28px] font-bold text-[#0B1F3A] tabular-nums leading-none">
              {loading ? '—' : scopedAwaitingVerification}
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Potential Alerts
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="text-[28px] font-bold text-[#0B1F3A] tabular-nums leading-none">
                {loading ? '—' : scopedActiveAlerts.length}
              </span>
              {!loading && highAlertsCount > 0 && (
                <StatusTag label={`${highAlertsCount} high`} tone="high" />
              )}
            </div>
          </div>
        </section>

        {/* Row 2: 14-Day Trend Chart + AI-Generated Summary Card */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-[6px] p-5 flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Diarrhoea and Vomiting Reports, Daily (Last 14 Days)
              </p>
              <p className="text-[12px] text-[#4A5B70] mt-2">
                Expected range (baseline band)
              </p>
            </div>

            <div className="h-[190px] w-full mt-2">
              {loading ? (
                <div className="h-full flex items-center justify-center text-[13px] text-[#4A5B70]">
                  Loading daily trend...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#4A5B70' }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#4A5B70' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="expectedRange"
                      name="Expected range"
                      stroke="none"
                      fill="#E2E8F0"
                      fillOpacity={0.65}
                    />
                    <Line
                      type="monotone"
                      dataKey="reports"
                      name="Daily reports"
                      stroke="#0E7C86"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: '#0E7C86' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 bg-white border border-[#0E7C86] rounded-[6px] p-5 flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0E7C86]">
                AI-Generated Summary · Not a Diagnosis
              </p>
              <p className="mt-3 text-[14px] text-[#0B1F3A] leading-relaxed">
                {latestAssessment?.aiSummary ||
                  'Statistical detection is monitoring community reports against historical baselines. Open Risk Intelligence to review signals or run a Gemini synthesis.'}
              </p>
              <p className="mt-3 text-[12px] text-[#4A5B70] tabular-nums">
                Confidence: {latestAssessment?.riskLevel === 'high' ? 'Moderate' : 'Preliminary'} ·{' '}
                {latestAssessment?.traceableReportIds.length ?? scopedReports.length} reports
              </p>
            </div>

            <div className="mt-4">
              <Link
                to="/intelligence"
                className="inline-flex items-center justify-center px-4 py-2 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px] transition-colors"
              >
                Open intelligence
              </Link>
            </div>
          </div>
        </section>

        {/* Row 3: Recent Reports Table + Community Risk & Investigations */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-[6px] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Recent Reports
              </p>
              <Link
                to="/reports"
                className="text-[12px] font-medium text-[#0E7C86] hover:underline"
              >
                View all
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[12px] text-[#4A5B70]">
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 px-3 font-medium">Community</th>
                    <th className="py-2 px-3 font-medium">Symptoms</th>
                    <th className="py-2 px-3 font-medium text-right">People</th>
                    <th className="py-2 pl-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/70">
                  {scopedReports.slice(0, 6).map((r) => {
                    const tag = verificationTagProps(r.verificationStatus);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => navigate('/reports')}
                        className="hover:bg-[#F4F6F8]/70 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 pr-3 font-mono text-[12px] text-[#0B1F3A] whitespace-nowrap">
                          {r.id}
                        </td>
                        <td className="py-2.5 px-3 text-[#0B1F3A] whitespace-nowrap">
                          {r.communityName}
                        </td>
                        <td className="py-2.5 px-3 text-[#0B1F3A]">
                          {r.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#0B1F3A]">
                          {r.affectedCount}
                        </td>
                        <td className="py-2.5 pl-3">
                          <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && scopedReports.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[#4A5B70]">
                        No matching reports found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-3">
                  Community Risk
                </p>
                <div className="space-y-2.5">
                  {detections.map((d) => {
                    const tag = classificationTagProps(d.suggestedClassification);
                    return (
                      <div key={d.communityId} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium text-[#0B1F3A] truncate">{d.communityName}</span>
                        <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                    Investigation Activities
                  </p>
                  <Link
                    to="/investigations"
                    className="text-[12px] font-medium text-[#0E7C86] hover:underline"
                  >
                    Manage
                  </Link>
                </div>
                {scopedInvestigations.length === 0 ? (
                  <p className="text-[13px] text-[#4A5B70]">No active investigations.</p>
                ) : (
                  <div className="space-y-2.5">
                    {scopedInvestigations.slice(0, 3).map((inv) => (
                      <Link
                        key={inv.id}
                        to="/investigations"
                        className="block text-[13px] text-[#0B1F3A] hover:text-[#0E7C86] transition-colors"
                      >
                        <p className="font-medium truncate">{inv.title}</p>
                        <p className="text-[12px] text-[#4A5B70] tabular-nums">
                          <span className="font-mono">{inv.id}</span> · {inv.communityName} ·{' '}
                          <span className="capitalize">{inv.status.replace('_', ' ')}</span>
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Row 4: Emerging Symptom Patterns */}
        <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Emerging Symptom Patterns (7-Day Frequency)
            </p>
            <Link to="/map" className="text-[12px] font-medium text-[#0E7C86] hover:underline">
              Open geographic risk map
            </Link>
          </div>
          {symptomBreakdown.length === 0 ? (
            <p className="text-[13px] text-[#4A5B70]">No symptom pattern data available.</p>
          ) : (
            <div className="h-[175px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={symptomBreakdown}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 20, bottom: 0 }}
                >
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#4A5B70' }} />
                  <YAxis
                    type="category"
                    dataKey="symptom"
                    width={165}
                    tick={{ fontSize: 12, fill: '#0B1F3A' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Reports" fill="#0E7C86" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
