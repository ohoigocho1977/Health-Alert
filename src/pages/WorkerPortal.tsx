import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layout } from '../components/Layout';
import { StatusTag, classificationTagProps, verificationTagProps } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import {
  SYMPTOM_LABELS,
  fieldVerificationSchema,
  interventionCreateSchema,
  symptomReportSchema,
  type AlertRecord,
  type Community,
  type CommunityDetectionResult,
  type HealthReport,
  type Intervention,
  type Investigation,
  type NotificationItem,
  type SymptomKey,
} from '../shared/types';
import { z } from 'zod';

type VerifyFormValues = z.infer<typeof fieldVerificationSchema>;
type QuickReportValues = z.infer<typeof symptomReportSchema>;
type InterventionFormValues = z.infer<typeof interventionCreateSchema>;

type WorkerTab = 'tasks' | 'investigations' | 'reports' | 'updates';

const SYMPTOM_KEYS = Object.keys(SYMPTOM_LABELS) as SymptomKey[];

const INTERVENTION_LABELS: Record<Intervention['actionType'], string> = {
  water_chlorination: 'Water Chlorination',
  boil_water_advisory: 'Boil-Water Advisory',
  ors_distribution: 'ORS / Zinc Distribution',
  source_closure: 'Source Closure',
  hygiene_sensitization: 'Hygiene Sensitization',
  sample_lab_referral: 'Lab Sample Referral',
};

export function WorkerPortal() {
  const { user } = useAuth();
  const { selectedCommunityId, setSelectedCommunityId, searchQuery } = useGlobalFilter();
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [detections, setDetections] = useState<CommunityDetectionResult[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [activeTab, setActiveTab] = useState<WorkerTab>('tasks');
  const [selectedReport, setSelectedReport] = useState<HealthReport | null>(null);
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [editingFindingsId, setEditingFindingsId] = useState<string | null>(null);
  const [findingsDraft, setFindingsDraft] = useState('');
  const [activeInvForIntervention, setActiveInvForIntervention] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(fieldVerificationSchema),
    defaultValues: {
      reportId: '',
      outcome: 'confirmed_cluster',
      waterSampleTaken: false,
      clinicalNotes: '',
      householdsVisited: 1,
    },
  });

  const quickForm = useForm<QuickReportValues>({
    resolver: zodResolver(symptomReportSchema),
    defaultValues: {
      communityId: user?.primaryCommunityId || 'comm-makoko',
      symptoms: ['watery_diarrhoea'],
      severity: 'moderate',
      onsetDate: new Date().toISOString().slice(0, 10),
      affectedCount: 1,
      ageGroup: 'mixed_household',
      suspectedWaterSourceId: '',
      notes: '',
    },
  });

  const intForm = useForm<InterventionFormValues>({
    resolver: zodResolver(interventionCreateSchema),
    defaultValues: {
      investigationId: '',
      actionType: 'ors_distribution',
      description: '',
      householdsReached: 10,
      status: 'completed',
    },
  });

  const quickCommunityId = quickForm.watch('communityId');
  const quickSymptoms = quickForm.watch('symptoms');
  const quickCommunity = communities.find((c) => c.id === quickCommunityId);

  const loadData = useCallback(async () => {
    try {
      const [repRes, invRes, commRes, intelRes, alertRes, notifRes] = await Promise.all([
        api.getReports(),
        api.getInvestigations(),
        api.getCommunities(),
        api.getIntelligenceSummary(),
        api.getAlerts(),
        api.getNotifications(),
      ]);
      setReports(repRes.reports);
      setInvestigations(invRes.investigations);
      setInterventions(invRes.interventions);
      setCommunities(commRes.communities);
      setDetections(intelRes.detections);
      setAlerts(alertRes.alerts);
      setNotifications(notifRes.notifications);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load field operations data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const authorizedCommunities = communities.filter(
    (c) => user?.role === 'admin' || user?.assignedCommunityIds.includes(c.id)
  );

  const primaryCommunity =
    (selectedCommunityId && authorizedCommunities.find((c) => c.id === selectedCommunityId)) ||
    authorizedCommunities.find((c) => c.id === user?.primaryCommunityId) ||
    authorizedCommunities[0] ||
    communities[0];

  const q = searchQuery.trim().toLowerCase();
  const scopedReports = reports.filter((r) => {
    if (selectedCommunityId && authorizedCommunities.some((c) => c.id === selectedCommunityId)) {
      if (r.communityId !== selectedCommunityId) return false;
    }
    if (!q) return true;
    return (
      r.id.toLowerCase().includes(q) ||
      r.communityName.toLowerCase().includes(q) ||
      r.symptoms.some((s) => (SYMPTOM_LABELS[s] || s).toLowerCase().includes(q))
    );
  });

  const primaryDetection =
    detections.find((d) => d.communityId === primaryCommunity?.id) || detections[0];
  const awaitingReports = scopedReports.filter(
    (r) => r.verificationStatus === 'pending' || r.verificationStatus === 'under_review'
  );
  const openInvestigations = investigations.filter((i) => i.status !== 'closed');
  const urgentInv =
    openInvestigations.find(
      (i) => i.priority === 'urgent' && (!primaryCommunity || i.communityId === primaryCommunity.id)
    ) ||
    openInvestigations.find((i) => i.priority === 'urgent') ||
    openInvestigations[0];
  const unreadNotifsCount = user
    ? notifications.filter((n) => !n.readByUids.includes(user.id)).length
    : 0;

  const openVerification = (rep: HealthReport) => {
    setSelectedReport(rep);
    verifyForm.reset({
      reportId: rep.id,
      outcome: 'confirmed_cluster',
      waterSampleTaken: false,
      clinicalNotes: '',
      householdsVisited: 1,
    });
  };

  const toggleQuickSymptom = (key: SymptomKey) => {
    const current = quickForm.getValues('symptoms');
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    quickForm.setValue('symptoms', next, { shouldValidate: true });
  };

  const handleVerifySubmit = async (values: VerifyFormValues) => {
    setFeedback(null);
    try {
      await api.submitVerification(values);
      setFeedback({ type: 'ok', text: `Verification saved for ${values.reportId}.` });
      setSelectedReport(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save verification.',
      });
    }
  };

  const handleQuickSubmit = async (values: QuickReportValues) => {
    setFeedback(null);
    try {
      const res = await api.submitReport({
        ...values,
        suspectedWaterSourceId: values.suspectedWaterSourceId || undefined,
      });
      setFeedback({ type: 'ok', text: `Field report ${res.report.id} logged.` });
      setShowQuickReport(false);
      quickForm.reset({
        communityId: user?.primaryCommunityId || primaryCommunity?.id || 'comm-makoko',
        symptoms: ['watery_diarrhoea'],
        severity: 'moderate',
        onsetDate: new Date().toISOString().slice(0, 10),
        affectedCount: 1,
        ageGroup: 'mixed_household',
        suspectedWaterSourceId: '',
        notes: '',
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to submit field report.',
      });
    }
  };

  const handleWaterSourceStatus = async (communityId: string, sourceId: string, status: string) => {
    setFeedback(null);
    try {
      await api.updateWaterSourceStatus(communityId, sourceId, status);
      setFeedback({ type: 'ok', text: 'Water source condition updated.' });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update water source.',
      });
    }
  };

  const handleInvestigationStatus = async (id: string, status: string) => {
    setFeedback(null);
    try {
      await api.updateInvestigation(id, { status });
      setFeedback({ type: 'ok', text: `Investigation ${id} status updated.` });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update investigation status.',
      });
    }
  };

  const handleSaveFindings = async (id: string) => {
    if (findingsDraft.trim().length < 5) {
      setFeedback({ type: 'err', text: 'Findings summary must be at least 5 characters.' });
      return;
    }
    setFeedback(null);
    try {
      await api.updateInvestigation(id, { findingsSummary: findingsDraft.trim() });
      setEditingFindingsId(null);
      setFeedback({ type: 'ok', text: `Field findings saved for ${id}.` });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update investigation notes.',
      });
    }
  };

  const handleInterventionSubmit = async (values: InterventionFormValues) => {
    setFeedback(null);
    try {
      await api.createIntervention(values);
      setFeedback({ type: 'ok', text: 'Intervention record saved to investigation log.' });
      setActiveInvForIntervention(null);
      intForm.reset({
        investigationId: '',
        actionType: 'ors_distribution',
        description: '',
        householdsReached: 10,
        status: 'completed',
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to record intervention.',
      });
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      await loadData();
    } catch {
      // ignore error
    }
  };

  const overviewTag = primaryDetection
    ? classificationTagProps(primaryDetection.suggestedClassification)
    : { label: 'Normal', tone: 'neutral' as const, showShape: false };

  return (
    <Layout
      title={`Today, ${primaryCommunity?.name || 'Field Operations'}`}
      showDemoBadge={false}
      headerActions={
        <div className="flex items-center gap-2">
          {authorizedCommunities.length > 1 && (
            <select
              aria-label="Select assigned community"
              value={primaryCommunity?.id || ''}
              onChange={(e) => setSelectedCommunityId(e.target.value)}
              className="h-9 px-2.5 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A]"
            >
              {authorizedCommunities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowQuickReport(true)}
            className="hidden sm:inline-flex h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px] items-center"
          >
            + Quick report
          </button>
        </div>
      }
    >
      <div className="max-w-[960px] pb-28 sm:pb-6 space-y-4">
        {/* Desktop & Tablet Segmented Navigation Strip */}
        <div
          className="hidden sm:inline-flex bg-white border border-[#E2E8F0] rounded-[6px] p-1 gap-1"
          role="tablist"
          aria-label="Field worker sections"
        >
          {(
            [
              { id: 'tasks', label: `Tasks (${awaitingReports.length})` },
              { id: 'investigations', label: `Investigations (${openInvestigations.length})` },
              { id: 'reports', label: `Incoming Reports (${scopedReports.length})` },
              {
                id: 'updates',
                label: `Alerts & Updates${unreadNotifsCount > 0 ? ` (${unreadNotifsCount})` : ''}`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-1.5 text-[13px] font-medium rounded-[4px] transition-colors ${
                activeTab === t.id
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-[#4A5B70] hover:text-[#0B1F3A] hover:bg-[#F4F6F8]'
              }`}
            >
              {t.label}
            </button>
          ))}
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

        {/* Tasks Tab (Page 3 primary mobile-first stack) */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            {/* Urgent Red-Bordered Card */}
            <section className="bg-white border border-[#B42318] rounded-[6px] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <StatusTag label="Urgent" tone="high" />
                {urgentInv && (
                  <span className="font-mono text-[12px] text-[#4A5B70]">
                    {urgentInv.id} · {urgentInv.status.replace('_', ' ')}
                  </span>
                )}
              </div>
              <h2 className="mt-2.5 text-[18px] font-bold text-[#0B1F3A]">
                {urgentInv ? urgentInv.title : 'Visit suspected community water point'}
              </h2>
              <p className="mt-1 text-[13px] text-[#4A5B70] tabular-nums">
                {awaitingReports.length} reports awaiting verification · {openInvestigations.length}{' '}
                active investigations
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (awaitingReports[0]) {
                      openVerification(awaitingReports[0]);
                    } else if (reports[0]) {
                      openVerification(reports[0]);
                    }
                  }}
                  className="flex-1 h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px] transition-colors"
                >
                  Start field verification
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('investigations')}
                  className="h-11 px-4 bg-white border border-[#E2E8F0] hover:bg-[#F4F6F8] text-[#0B1F3A] text-[14px] font-medium rounded-[6px] transition-colors"
                >
                  Update investigation ({openInvestigations.length})
                </button>
              </div>
            </section>

            {/* Awaiting Verification Card */}
            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Awaiting Verification ({awaitingReports.length})
              </p>

              {loading ? (
                <p className="mt-3 text-[13px] text-[#4A5B70]">Loading assigned reports...</p>
              ) : awaitingReports.length === 0 ? (
                <p className="mt-3 text-[13px] text-[#4A5B70]">
                  All incoming reports in your community have been reviewed.
                </p>
              ) : (
                <div className="mt-2.5 divide-y divide-[#E2E8F0]">
                  {awaitingReports.slice(0, 6).map((rep) => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => openVerification(rep)}
                      className="w-full py-2.5 min-h-[44px] text-left flex items-center justify-between gap-3 hover:bg-[#F4F6F8]/70 rounded-[4px] px-1 transition-colors"
                    >
                      <span className="text-[14px] text-[#0B1F3A] truncate">
                        <span className="font-mono text-[13px] font-medium">{rep.id}</span> ·{' '}
                        {rep.affectedCount} {rep.affectedCount === 1 ? 'person' : 'people'} ·{' '}
                        {rep.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ')}
                      </span>
                      <span className="text-[12px] font-semibold text-[#0E7C86] shrink-0">
                        Verify
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Community Overview Card */}
            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Community Overview
              </p>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <StatusTag
                  label={overviewTag.label}
                  tone={overviewTag.tone}
                  showShape={overviewTag.showShape}
                />
                <span className="text-[12px] text-[#4A5B70] tabular-nums">
                  {primaryDetection?.recentReportCount ?? 0} reports in 48h ·{' '}
                  {primaryDetection?.verifiedCount ?? 0} verified
                </span>
              </div>

              {primaryCommunity && primaryCommunity.waterSources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#E2E8F0] space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                    Monitored Water Sources
                  </p>
                  {primaryCommunity.waterSources.map((ws) => (
                    <div key={ws.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="text-[#0B1F3A] truncate">{ws.name}</span>
                      <select
                        aria-label={`Condition for ${ws.name}`}
                        value={ws.status}
                        onChange={(e) =>
                          handleWaterSourceStatus(primaryCommunity.id, ws.id, e.target.value)
                        }
                        className="h-9 px-2.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white"
                      >
                        <option value="operational">Operational</option>
                        <option value="suspected">Suspected</option>
                        <option value="tested_contaminated">Contaminated</option>
                        <option value="closed_treated">Closed / Treated</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Assigned Investigations & Intervention Records Tab */}
        {activeTab === 'investigations' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 text-center text-[13px] text-[#4A5B70]">
                Loading assigned investigations...
              </div>
            ) : investigations.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 text-center text-[13px] text-[#4A5B70]">
                No field investigations are currently assigned to your communities.
              </div>
            ) : (
              investigations.map((inv) => {
                const invInterventions = interventions.filter(
                  (iv) => iv.investigationId === inv.id
                );
                const isEditingFindings = editingFindingsId === inv.id;
                const isLoggingIntervention = activeInvForIntervention === inv.id;

                return (
                  <article
                    key={inv.id}
                    className={`bg-white border rounded-[6px] p-4 sm:p-5 space-y-3.5 ${
                      inv.priority === 'urgent' && inv.status !== 'closed'
                        ? 'border-[#B42318]'
                        : 'border-[#E2E8F0]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusTag
                            label={inv.priority.charAt(0).toUpperCase() + inv.priority.slice(1)}
                            tone={
                              inv.priority === 'urgent'
                                ? 'high'
                                : inv.priority === 'elevated'
                                  ? 'elevated'
                                  : 'statistical'
                            }
                          />
                          <span className="font-mono text-[12px] text-[#4A5B70]">{inv.id}</span>
                          <span className="text-[12px] text-[#4A5B70]">· {inv.communityName}</span>
                        </div>
                        <h3 className="mt-2 text-[16px] font-bold text-[#0B1F3A]">{inv.title}</h3>
                        <p className="text-[12px] text-[#4A5B70] mt-0.5">
                          Lead: {inv.leadWorkerName || 'Community Response Team'} · Updated{' '}
                          {new Date(inv.updatedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Status for ${inv.title}`}
                          value={inv.status}
                          onChange={(e) => handleInvestigationStatus(inv.id, e.target.value)}
                          className="h-10 px-3 text-[13px] font-medium border border-[#CBD5E1] rounded-[6px] bg-white text-[#0B1F3A]"
                        >
                          <option value="open">Open</option>
                          <option value="field_dispatch">Field dispatch</option>
                          <option value="sampling">Sampling</option>
                          <option value="contained">Contained</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveInvForIntervention(isLoggingIntervention ? null : inv.id);
                            intForm.setValue('investigationId', inv.id);
                          }}
                          className="h-10 px-3.5 text-[13px] font-semibold bg-[#0E7C86] hover:bg-[#0B666E] text-white rounded-[6px]"
                        >
                          {isLoggingIntervention ? 'Close form' : '+ Log intervention'}
                        </button>
                      </div>
                    </div>

                    {/* Editable Investigation Findings */}
                    <div className="p-3 bg-[#F4F6F8] border border-[#E2E8F0] rounded-[6px]">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                          Field Findings & Updates
                        </span>
                        {!isEditingFindings && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFindingsId(inv.id);
                              setFindingsDraft(inv.findingsSummary);
                            }}
                            className="text-[12px] font-medium text-[#0E7C86] hover:underline"
                          >
                            Update notes
                          </button>
                        )}
                      </div>

                      {isEditingFindings ? (
                        <div className="space-y-2 mt-2">
                          <textarea
                            rows={3}
                            value={findingsDraft}
                            onChange={(e) => setFindingsDraft(e.target.value)}
                            className="w-full p-2.5 text-[13px] bg-white border border-[#CBD5E1] rounded-[6px]"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingFindingsId(null)}
                              className="h-9 px-3 text-[12px] border border-[#E2E8F0] bg-white rounded-[6px] text-[#4A5B70]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveFindings(inv.id)}
                              className="h-9 px-3 text-[12px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                            >
                              Save update
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] text-[#0B1F3A] leading-relaxed">
                          {inv.findingsSummary}
                        </p>
                      )}
                    </div>

                    {/* Inline Log Intervention Form */}
                    {isLoggingIntervention && (
                      <form
                        onSubmit={intForm.handleSubmit(handleInterventionSubmit)}
                        className="p-4 bg-white border border-[#0E7C86] rounded-[6px] space-y-3"
                      >
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-[#0E7C86]">
                          Record Field Intervention
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-[#4A5B70] mb-1">
                              Action Type
                            </label>
                            <select
                              {...intForm.register('actionType')}
                              className="w-full h-10 px-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white"
                            >
                              <option value="ors_distribution">ORS / Zinc Distribution</option>
                              <option value="water_chlorination">Water Chlorination</option>
                              <option value="boil_water_advisory">Boil-Water Advisory</option>
                              <option value="source_closure">Source Closure</option>
                              <option value="hygiene_sensitization">Hygiene Sensitization</option>
                              <option value="sample_lab_referral">Lab Sample Referral</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#4A5B70] mb-1">
                              Households Reached
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={10000}
                              {...intForm.register('householdsReached', { valueAsNumber: true })}
                              className="w-full h-10 px-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[#4A5B70] mb-1">
                              Status
                            </label>
                            <select
                              {...intForm.register('status')}
                              className="w-full h-10 px-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white"
                            >
                              <option value="planned">Planned</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#4A5B70] mb-1">
                            Action Details
                          </label>
                          <textarea
                            rows={2}
                            {...intForm.register('description')}
                            placeholder="Describe chlorine dosing, ORS packs distributed, or community sensitization completed..."
                            className="w-full p-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white"
                          />
                          {intForm.formState.errors.description && (
                            <p className="mt-1 text-[12px] text-[#B42318]">
                              {intForm.formState.errors.description.message}
                            </p>
                          )}
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveInvForIntervention(null)}
                            className="h-9 px-3 text-[12px] border border-[#E2E8F0] rounded-[6px] text-[#4A5B70]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={intForm.formState.isSubmitting}
                            className="h-9 px-4 text-[12px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                          >
                            {intForm.formState.isSubmitting ? 'Saving...' : 'Save intervention'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Intervention Records List */}
                    <div className="pt-2 border-t border-[#E2E8F0]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-2">
                        Intervention Records ({invInterventions.length})
                      </p>
                      {invInterventions.length === 0 ? (
                        <p className="text-[12px] text-[#4A5B70]">
                          No interventions documented for this investigation yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {invInterventions.map((iv) => (
                            <div
                              key={iv.id}
                              className="p-2.5 border border-[#E2E8F0] rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]"
                            >
                              <div>
                                <p className="font-semibold text-[#0B1F3A]">
                                  {INTERVENTION_LABELS[iv.actionType] || iv.actionType}
                                </p>
                                <p className="text-[#4A5B70] mt-0.5">{iv.description}</p>
                              </div>
                              <div className="text-left sm:text-right shrink-0 tabular-nums text-[#4A5B70]">
                                <span className="font-medium text-[#0B1F3A]">
                                  {iv.householdsReached} households
                                </span>{' '}
                                · <span className="capitalize">{iv.status.replace('_', ' ')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-3">
              Incoming Community Reports ({scopedReports.length})
            </p>
            {scopedReports.length === 0 ? (
              <p className="text-[13px] text-[#4A5B70]">No reports match your active filter.</p>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {scopedReports.map((rep) => {
                  const tag = verificationTagProps(rep.verificationStatus);
                  return (
                    <div
                      key={rep.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#0B1F3A] truncate">
                          <span className="font-mono">{rep.id}</span> · {rep.communityName} ·{' '}
                          <span className="capitalize">{rep.severity}</span>
                        </p>
                        <p className="text-[12px] text-[#4A5B70] truncate">
                          {rep.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ')} (
                          {rep.affectedCount})
                          {rep.suspectedWaterSourceLabel ? ` · ${rep.suspectedWaterSourceLabel}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                        <button
                          type="button"
                          onClick={() => openVerification(rep)}
                          className="h-9 px-3 text-[12px] font-medium border border-[#CBD5E1] rounded-[6px] text-[#0B1F3A] hover:bg-[#F4F6F8]"
                        >
                          Verify
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Updates Tab */}
        {activeTab === 'updates' && (
          <div className="space-y-4">
            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 sm:p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Active Alerts & Community Updates
              </p>
              {alerts.length === 0 ? (
                <p className="text-[13px] text-[#4A5B70]">
                  No active alerts in your assigned communities.
                </p>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className="p-3 border border-[#E2E8F0] rounded-[6px]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold text-[#0B1F3A]">{a.title}</p>
                      <StatusTag
                        label={a.severity.toUpperCase()}
                        tone={a.severity === 'critical' || a.severity === 'warning' ? 'high' : 'elevated'}
                      />
                    </div>
                    <p className="text-[12px] text-[#4A5B70] mt-0.5">
                      {a.communityName} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-[13px] text-[#0B1F3A] mt-1.5">{a.summary}</p>
                  </div>
                ))
              )}
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 sm:p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Dispatch Notifications ({notifications.length})
              </p>
              {notifications.length === 0 ? (
                <p className="text-[13px] text-[#4A5B70]">No dispatch notices.</p>
              ) : (
                notifications.map((n) => {
                  const isRead = user ? n.readByUids.includes(user.id) : true;
                  return (
                    <div
                      key={n.id}
                      className={`p-3 border rounded-[6px] flex items-start justify-between gap-3 ${
                        isRead ? 'border-[#E2E8F0] bg-white' : 'border-[#0E7C86] bg-[#E6F4F5]/40'
                      }`}
                    >
                      <div>
                        <p className="text-[13px] font-semibold text-[#0B1F3A]">{n.title}</p>
                        <p className="text-[12px] text-[#4A5B70] mt-0.5">{n.message}</p>
                      </div>
                      {!isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationRead(n.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#0E7C86] border border-[#0E7C86] rounded-[4px] shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}

        {/* Inline Field Verification Modal / Sheet */}
        {selectedReport && (
          <div className="fixed inset-0 z-50 bg-[#0B1F3A]/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white border border-[#E2E8F0] rounded-t-[10px] sm:rounded-[6px] p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0E7C86]">
                    Field Verification
                  </p>
                  <h3 className="text-[16px] font-bold text-[#0B1F3A] mt-0.5">
                    {selectedReport.id} · {selectedReport.communityName}
                  </h3>
                  <p className="text-[12px] text-[#4A5B70] mt-0.5">
                    {selectedReport.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ')} ·{' '}
                    {selectedReport.affectedCount} affected
                    {selectedReport.suspectedWaterSourceLabel
                      ? ` · ${selectedReport.suspectedWaterSourceLabel}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="text-[13px] text-[#4A5B70] hover:text-[#0B1F3A]"
                >
                  Close
                </button>
              </div>

              <form onSubmit={verifyForm.handleSubmit(handleVerifySubmit)} className="space-y-3.5">
                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    Verification Outcome
                  </label>
                  <select
                    {...verifyForm.register('outcome')}
                    className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] bg-white"
                  >
                    <option value="confirmed_cluster">Confirmed Cluster</option>
                    <option value="requires_lab_test">Requires Lab / Water Sample</option>
                    <option value="isolated_case">Isolated Case (Resolved)</option>
                    <option value="false_report">False / Duplicate Report</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                      Households Visited
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      {...verifyForm.register('householdsVisited', { valueAsNumber: true })}
                      className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] tabular-nums"
                    />
                  </div>
                  <label className="flex items-end pb-3 gap-2 text-[14px] text-[#0B1F3A]">
                    <input
                      type="checkbox"
                      {...verifyForm.register('waterSampleTaken')}
                      className="w-4 h-4 rounded border-[#CBD5E1]"
                    />
                    <span>Water sample taken</span>
                  </label>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    Field Observations
                  </label>
                  <textarea
                    rows={3}
                    {...verifyForm.register('clinicalNotes')}
                    className="w-full p-3 text-[14px] border border-[#CBD5E1] rounded-[6px]"
                    placeholder="Record household checks, ORS given, and water source condition..."
                  />
                  {verifyForm.formState.errors.clinicalNotes && (
                    <p className="mt-1 text-[12px] text-[#B42318]">
                      {verifyForm.formState.errors.clinicalNotes.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={verifyForm.formState.isSubmitting}
                  className="w-full h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px]"
                >
                  {verifyForm.formState.isSubmitting ? 'Saving...' : 'Save verification'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Quick Field Report Modal */}
        {showQuickReport && (
          <div className="fixed inset-0 z-50 bg-[#0B1F3A]/45 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white border border-[#E2E8F0] rounded-t-[10px] sm:rounded-[6px] p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <h3 className="text-[16px] font-bold text-[#0B1F3A]">Quick Field Report</h3>
                <button
                  type="button"
                  onClick={() => setShowQuickReport(false)}
                  className="text-[13px] text-[#4A5B70] hover:text-[#0B1F3A]"
                >
                  Close
                </button>
              </div>

              <form onSubmit={quickForm.handleSubmit(handleQuickSubmit)} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                      Community
                    </label>
                    <select
                      {...quickForm.register('communityId')}
                      className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] bg-white"
                    >
                      {communities
                        .filter(
                          (c) => user?.role === 'admin' || user?.assignedCommunityIds.includes(c.id)
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                      Symptom Onset Date
                    </label>
                    <input
                      type="date"
                      {...quickForm.register('onsetDate')}
                      className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1.5">
                    Observed Symptoms
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SYMPTOM_KEYS.map((key) => {
                      const active = quickSymptoms.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleQuickSymptom(key)}
                          className={`px-2.5 py-1.5 text-[12px] rounded-[4px] border transition-colors ${
                            active
                              ? 'bg-[#0E7C86] border-[#0E7C86] text-white font-medium'
                              : 'bg-[#F4F6F8] border-[#E2E8F0] text-[#4A5B70] hover:text-[#0B1F3A]'
                          }`}
                        >
                          {SYMPTOM_LABELS[key]}
                        </button>
                      );
                    })}
                  </div>
                  {quickForm.formState.errors.symptoms && (
                    <p className="mt-1 text-[12px] text-[#B42318]">
                      {quickForm.formState.errors.symptoms.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                      People affected
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      {...quickForm.register('affectedCount', { valueAsNumber: true })}
                      className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                      Severity
                    </label>
                    <select
                      {...quickForm.register('severity')}
                      className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] bg-white"
                    >
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    Suspected Water Source
                  </label>
                  <select
                    {...quickForm.register('suspectedWaterSourceId')}
                    className="w-full h-11 px-3 text-[14px] border border-[#CBD5E1] rounded-[6px] bg-white"
                  >
                    <option value="">Unspecified / Multiple sources</option>
                    {(quickCommunity?.waterSources || []).map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} ({ws.sourceType.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    Field Notes
                  </label>
                  <textarea
                    rows={2}
                    {...quickForm.register('notes')}
                    className="w-full p-2.5 text-[14px] border border-[#CBD5E1] rounded-[6px]"
                    placeholder="Brief clinical/environmental observation (no personal names)..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={quickForm.formState.isSubmitting}
                  className="w-full h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px]"
                >
                  {quickForm.formState.isSubmitting ? 'Sending...' : 'Send field report'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Mobile Worker Bar (Page 3 Pattern) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E2E8F0] px-4 pt-2.5 pb-2 space-y-2">
        <button
          type="button"
          onClick={() => setShowQuickReport(true)}
          className="w-full h-11 bg-[#0E7C86] text-white text-[14px] font-semibold rounded-[6px]"
        >
          + Quick report
        </button>
        <div className="grid grid-cols-4 text-center text-[11px] font-medium">
          {(
            [
              { id: 'tasks', label: 'Tasks' },
              { id: 'investigations', label: 'Cases' },
              { id: 'reports', label: 'Reports' },
              { id: 'updates', label: 'Updates' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`py-1.5 ${
                activeTab === t.id ? 'text-[#0E7C86] font-semibold' : 'text-[#4A5B70]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
}
