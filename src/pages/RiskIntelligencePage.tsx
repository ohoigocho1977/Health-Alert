import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layout } from '../components/Layout';
import { StatusTag, classificationTagProps } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import {
  CLASSIFICATION_LABELS,
  thresholdConfigSchema,
  type CommunityDetectionResult,
  type HealthReport,
  type RiskAssessment,
  type SurveillanceClassification,
  type ThresholdConfig,
} from '../shared/types';
import { z } from 'zod';

type ThresholdFormValues = z.infer<typeof thresholdConfigSchema>;

const STAGES: Array<{ key: SurveillanceClassification; label: string }> = [
  { key: 'individual_reports_only', label: '1. Individual reports' },
  { key: 'unusual_reporting_activity', label: '2. Unusual activity' },
  { key: 'potential_health_threat', label: '3. Potential threat' },
  { key: 'human_verified_incident', label: '4. Human-verified incident' },
  { key: 'officially_confirmed_outbreak', label: '5. Official outbreak' },
];

export function RiskIntelligencePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedCommunityId, setSelectedCommunityId } = useGlobalFilter();
  const isAdmin = user?.role === 'admin';

  const [detections, setDetections] = useState<CommunityDetectionResult[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [showThresholds, setShowThresholds] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [dismissNote, setDismissNote] = useState('');
  const [showDismissBox, setShowDismissBox] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const thresholdForm = useForm<ThresholdFormValues>({
    resolver: zodResolver(thresholdConfigSchema),
  });

  const loadData = useCallback(async () => {
    try {
      const [intelRes, repRes] = await Promise.all([
        api.getIntelligenceSummary(),
        api.getReports(),
      ]);
      setDetections(intelRes.detections);
      setAssessments(intelRes.assessments);
      setReports(repRes.reports);
      thresholdForm.reset(intelRes.thresholdConfig);

      if (
        intelRes.detections.length > 0 &&
        (!selectedCommunityId ||
          !intelRes.detections.some((d) => d.communityId === selectedCommunityId))
      ) {
        setSelectedCommunityId(intelRes.detections[0].communityId);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load risk intelligence.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCommunityId, setSelectedCommunityId, thresholdForm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeDetection =
    detections.find((d) => d.communityId === selectedCommunityId) || detections[0];
  const activeAssessment = assessments.find(
    (a) => a.communityId === activeDetection?.communityId
  );

  const communityReports = reports.filter(
    (r) => r.communityId === activeDetection?.communityId
  );
  const vomitingPct =
    communityReports.length > 0
      ? Math.round(
          (communityReports.filter((r) => r.symptoms.includes('vomiting')).length /
            communityReports.length) *
            100
        )
      : 0;
  const diarrhoeaPct =
    communityReports.length > 0
      ? Math.round(
          (communityReports.filter(
            (r) =>
              r.symptoms.includes('watery_diarrhoea') || r.symptoms.includes('bloody_diarrhoea')
          ).length /
            communityReports.length) *
            100
        )
      : 0;
  const missingWaterCount = communityReports.filter((r) => !r.suspectedWaterSourceId).length;
  const spatialSignals =
    activeDetection?.signals.filter((s) => s.signalType === 'spatial_cluster') || [];

  const handleRunGemini = async () => {
    if (!activeDetection) return;
    setAiLoading(true);
    setFeedback(null);
    try {
      const res = await api.runGeminiAnalysis(activeDetection.communityId);
      setFeedback({
        type: 'ok',
        text: `Generated Gemini explanation for ${res.assessment.communityName}.`,
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gemini intelligence call failed.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleStartInvestigation = async () => {
    if (!activeDetection) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await api.createInvestigation({
        communityId: activeDetection.communityId,
        title: `${activeDetection.communityName} Cluster Field Verification`,
        priority: activeDetection.signals.length >= 3 ? 'urgent' : 'elevated',
        findingsSummary:
          activeAssessment?.aiSummary ||
          `Triggered by ${activeDetection.signals.length} statistical signals (${activeDetection.recentReportCount} recent reports).`,
        linkedReportIds: activeDetection.traceableReportIds,
      });
      navigate('/investigations');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to start investigation.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveThresholds = async (values: ThresholdConfig) => {
    setFeedback(null);
    try {
      await api.updateThresholds(values);
      setFeedback({ type: 'ok', text: 'Detection thresholds updated.' });
      setShowThresholds(false);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update thresholds.',
      });
    }
  };

  const handleDismissObservation = async () => {
    if (!activeDetection) return;
    if (dismissNote.trim().length < 5) {
      setFeedback({ type: 'err', text: 'Enter a rationale note of at least 5 characters.' });
      return;
    }
    setActionBusy(true);
    setFeedback(null);
    try {
      await api.dismissObservation(activeDetection.communityId, dismissNote.trim());
      setShowDismissBox(false);
      setFeedback({
        type: 'ok',
        text: `Recorded observation note for ${activeDetection.communityName}: "${dismissNote.trim()}"`,
      });
      setDismissNote('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save observation note.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const expectedLow = activeDetection
    ? Math.max(1, Math.round(activeDetection.baselineDailyMean * 2 * 0.7))
    : 0;
  const expectedHigh = activeDetection
    ? Math.max(2, Math.round(activeDetection.baselineDailyMean * 2 * 1.4))
    : 0;

  return (
    <Layout
      title="Risk Intelligence"
      subtitle="Demonstration data. Statistical pattern screening and AI summaries support human investigation and never issue medical diagnoses."
      showDemoBadge={false}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select community for analysis"
            value={activeDetection?.communityId || ''}
            onChange={(e) => setSelectedCommunityId(e.target.value)}
            className="h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A]"
          >
            {detections.map((d) => (
              <option key={d.communityId} value={d.communityId}>
                {d.communityName}
              </option>
            ))}
          </select>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowThresholds((v) => !v)}
              className="h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A] hover:bg-[#F4F6F8]"
            >
              Thresholds
            </button>
          )}
          <button
            type="button"
            disabled={aiLoading || !activeDetection}
            onClick={handleRunGemini}
            className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white rounded-[6px] text-[13px] font-semibold disabled:opacity-60"
          >
            {aiLoading ? 'Generating...' : 'Run Gemini analysis'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Stage Indicator Tags + 5-Stage Progression */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag label="Statistical observation" tone="statistical" showShape={false} />
            <StatusTag label="AI-generated explanation" tone="ai" showShape={false} />
            <StatusTag label="Human-verified finding" tone="verified" />
          </div>
          <Link to="/map" className="text-[12px] font-medium text-[#0E7C86] hover:underline">
            View clusters on Community Risk Map
          </Link>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-[6px] border text-[13px] ${
              feedback.type === 'ok'
                ? 'bg-[#DCFCE7]/50 border-[#146C3B]/30 text-[#146C3B]'
                : 'bg-[#FEE4E2] border-[#B42318]/30 text-[#B42318]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Configurable Statistical Thresholds Drawer */}
        {isAdmin && showThresholds && (
          <section className="bg-white border border-[#CBD5E1] rounded-[6px] p-5">
            <h2 className="text-[14px] font-semibold text-[#0B1F3A]">
              Configurable Statistical Thresholds
            </h2>
            <p className="text-[12px] text-[#4A5B70] mt-0.5">
              Operational screening parameters (not clinically validated epidemiological cutoffs).
            </p>
            <form
              onSubmit={thresholdForm.handleSubmit(handleSaveThresholds)}
              className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[
                { name: 'windowHours', label: 'Window (hours)' },
                { name: 'baselineDays', label: 'Baseline (days)' },
                { name: 'volumeMultiplierThreshold', label: 'Multiplier (x)' },
                { name: 'zScoreThreshold', label: 'Z-Score (σ)' },
                { name: 'clusterRadiusMeters', label: 'Cluster radius (m)' },
                { name: 'clusterMinReports', label: 'Min cluster reports' },
                { name: 'waterSourceConcentrationThreshold', label: 'Water source threshold' },
                { name: 'minReportsForAnomaly', label: 'Min report floor' },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    {f.label}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...thresholdForm.register(f.name as keyof ThresholdFormValues, {
                      valueAsNumber: true,
                    })}
                    className="w-full h-9 px-2.5 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
                  />
                  {thresholdForm.formState.errors[f.name as keyof ThresholdFormValues] && (
                    <p className="mt-1 text-[11px] text-[#B42318]">Invalid value</p>
                  )}
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowThresholds(false)}
                  className="px-3 py-1.5 text-[13px] border border-[#E2E8F0] rounded-[6px] text-[#4A5B70]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-[13px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                >
                  Save thresholds
                </button>
              </div>
            </form>
          </section>
        )}

        {loading || !activeDetection ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-8 text-center text-[13px] text-[#4A5B70]">
            Evaluating statistical surveillance signals...
          </div>
        ) : (
          <>
            {/* 5-Stage Early Warning Escalation Distinction */}
            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-2.5">
                Surveillance Classification Stage · {activeDetection.communityName}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {STAGES.map((st) => {
                  const isCurrent = activeDetection.suggestedClassification === st.key;
                  return (
                    <div
                      key={st.key}
                      className={`px-3 py-2 rounded-[6px] border text-[12px] ${
                        isCurrent
                          ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white font-semibold'
                          : 'bg-[#F4F6F8] border-[#E2E8F0] text-[#4A5B70]'
                      }`}
                    >
                      {st.label}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Top Full-Width Card: Statistical Observation */}
            <section className="bg-white border border-[#CBD5E1] rounded-[6px] p-5">
              <StatusTag label="Statistical observation" tone="statistical" showShape={false} />
              <h2 className="mt-3 text-[17px] font-bold text-[#0B1F3A] tabular-nums">
                {activeDetection.communityName}: {activeDetection.recentReportCount} reports in 48h vs
                expected {expectedLow}–{expectedHigh}
              </h2>
              <p className="mt-1.5 text-[13px] text-[#4A5B70] tabular-nums">
                Vomiting {vomitingPct}% · Diarrhoea {diarrhoeaPct}% · {activeDetection.signals.length}{' '}
                triggered signals · Z-score {activeDetection.zScore}σ · Multiplier{' '}
                {activeDetection.volumeMultiplier}x · Source: resident and worker reports (
                {communityReports.length})
              </p>

              {activeDetection.signals.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#E2E8F0] grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {activeDetection.signals.map((sig, i) => (
                    <div key={i} className="text-[12px] text-[#0B1F3A]">
                      <span className="font-semibold">{sig.label}:</span>{' '}
                      <span className="text-[#4A5B70]">{sig.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Bottom 2-Column Split: AI-Generated Explanation (Teal border) + Human-Verified */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              <div className="bg-white border border-[#0E7C86] rounded-[6px] p-5 flex flex-col justify-between">
                <div>
                  <StatusTag label="AI-generated explanation" tone="ai" showShape={false} />
                  <p className="mt-3 text-[14px] text-[#0B1F3A] leading-relaxed">
                    {activeAssessment?.patternExplanation ||
                      activeAssessment?.aiSummary ||
                      'No Gemini explanation has been generated for this community yet. Click "Run Gemini analysis" to synthesize current statistical signals and field notes.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E2E8F0] space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#4A5B70]">
                    <span>Confidence:</span>
                    <StatusTag
                      label={activeAssessment?.riskLevel === 'high' ? 'Moderate' : 'Preliminary'}
                      tone="elevated"
                    />
                    <span>
                      · Uncertainty:{' '}
                      {activeAssessment?.uncertaintyStatement ||
                        `${missingWaterCount} reports lack a suspected water source`}
                    </span>
                  </div>
                  {activeAssessment && (
                    <p className="text-[11px] font-mono text-[#4A5B70]">
                      Traceable reports: {activeAssessment.traceableReportIds.join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 flex flex-col justify-between">
                <div>
                  <StatusTag label="Human-verified" tone="verified" />
                  <p className="mt-3 text-[14px] text-[#0B1F3A]">
                    {activeDetection.verifiedCount > 0
                      ? `${activeDetection.verifiedCount} verified on site. ${activeDetection.pendingCount} reports await health-worker review.`
                      : `Nothing verified yet. ${activeDetection.pendingCount} reports await health-worker review.`}
                  </p>

                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                      Suggested Priorities
                    </p>
                    <p className="mt-1.5 text-[13px] text-[#0B1F3A] leading-relaxed">
                      {(activeAssessment?.recommendedPriorities?.length
                        ? activeAssessment.recommendedPriorities
                        : [
                            'Visit suspected community water point',
                            `Verify ${activeDetection.pendingCount} pending reports`,
                            'Compare trend with neighbouring wards',
                          ]
                      )
                        .slice(0, 3)
                        .map((item, idx) => `${idx + 1}. ${item}`)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  {showDismissBox ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={dismissNote}
                        onChange={(e) => setDismissNote(e.target.value)}
                        placeholder="Enter rationale note (e.g., duplicate reporting event)"
                        className="w-full h-9 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={handleDismissObservation}
                          className="px-3 py-1.5 bg-[#0B1F3A] text-white text-[12px] font-semibold rounded-[6px] disabled:opacity-60"
                        >
                          {actionBusy ? 'Saving...' : 'Save note'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDismissBox(false)}
                          className="px-3 py-1.5 border border-[#E2E8F0] text-[#4A5B70] text-[12px] rounded-[6px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleStartInvestigation}
                        className="px-4 py-2 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px] transition-colors"
                      >
                        {actionBusy ? 'Creating...' : 'Start investigation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDismissBox(true)}
                        className="px-4 py-2 bg-white border border-[#E2E8F0] hover:bg-[#F4F6F8] text-[#0B1F3A] text-[13px] font-medium rounded-[6px] transition-colors"
                      >
                        Dismiss with note
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Community-Level Trend & Spatial Cluster Details */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-[6px] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-2">
                  Community Trend · {activeDetection.communityName} (14 Days vs Baseline)
                </p>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={activeDetection.dailySeries}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4A5B70' }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4A5B70' }} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="reports" name="Reports" fill="#0E7C86" radius={[3, 3, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="baseline"
                        name="Baseline/day"
                        stroke="#93370D"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-[6px] p-5 flex flex-col justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-2">
                    Potential Reporting Clusters & Cross-Community Comparison
                  </p>
                  {spatialSignals.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {spatialSignals.map((sig, i) => (
                        <div key={i} className="p-2.5 bg-[#FEF0C7]/50 border border-[#93370D]/25 rounded-[6px] text-[12px] text-[#0B1F3A]">
                          <p className="font-semibold">{sig.label}</p>
                          <p className="text-[#4A5B70] mt-0.5">{sig.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#4A5B70] mb-3">
                      No tight geographic report cluster detected in {activeDetection.communityName}.
                    </p>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0]">
                    {detections.map((d) => {
                      const tag = classificationTagProps(d.suggestedClassification);
                      return (
                        <div key={d.communityId} className="flex items-center justify-between text-[12px]">
                          <span className="text-[#0B1F3A]">{d.communityName}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums text-[#4A5B70]">
                              {d.volumeMultiplier}x
                            </span>
                            <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Methodological Limitations */}
            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 text-[12px] text-[#4A5B70]">
              <p className="font-semibold text-[#0B1F3A] mb-1">
                Statistical Methodology & Limitations
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {activeDetection.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
