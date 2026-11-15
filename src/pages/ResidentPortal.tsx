import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusTag, verificationTagProps } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  SYMPTOM_LABELS,
  symptomReportSchema,
  type AlertRecord,
  type Community,
  type HealthReport,
  type NotificationItem,
  type SymptomKey,
} from '../shared/types';
import { z } from 'zod';

type ReportFormValues = z.infer<typeof symptomReportSchema>;

const SYMPTOM_KEYS = Object.keys(SYMPTOM_LABELS) as SymptomKey[];

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export function ResidentPortal() {
  const { user } = useAuth();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [myReports, setMyReports] = useState<HealthReport[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(symptomReportSchema),
    defaultValues: {
      communityId: user?.primaryCommunityId || 'comm-makoko',
      symptoms: ['vomiting'],
      severity: 'moderate',
      onsetDate: daysAgoIso(1),
      affectedCount: 1,
      ageGroup: '18_59',
      suspectedWaterSourceId: '',
      notes: '',
    },
  });

  const selectedCommunityId = form.watch('communityId');
  const selectedSymptoms = form.watch('symptoms');
  const selectedOnset = form.watch('onsetDate');
  const selectedCommunity = communities.find((c) => c.id === selectedCommunityId);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [commRes, repRes, alertRes, notifRes] = await Promise.all([
        api.getCommunities(),
        api.getReports(),
        api.getAlerts(),
        api.getNotifications(),
      ]);
      setCommunities(commRes.communities);
      setMyReports(repRes.reports);
      setAlerts(alertRes.alerts);
      setNotifications(notifRes.notifications);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load community data.');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSymptom = (key: SymptomKey) => {
    const current = form.getValues('symptoms');
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    form.setValue('symptoms', next, { shouldValidate: true });
  };

  const onSubmit = async (values: ReportFormValues) => {
    setSubmitError(null);
    setSubmittedRef(null);
    try {
      const res = await api.submitReport({
        ...values,
        suspectedWaterSourceId: values.suspectedWaterSourceId || undefined,
      });
      setSubmittedRef(res.report.id);
      await loadData();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit report.');
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

  const unreadNotifs = user
    ? notifications.filter((n) => !n.readByUids.includes(user.id))
    : [];

  return (
    <Layout title="Report a health problem" hideDesktopHeader>
      <div className="max-w-[540px] mx-auto space-y-6 py-2">
        {/* Main Report Card matching Page 4 */}
        <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 sm:p-6">
          <h1 className="text-[22px] font-bold text-[#0B1F3A] tracking-tight">
            Report a health problem
          </h1>
          <p className="mt-1 text-[14px] text-[#4A5B70]">
            Takes about 1 minute. This is not a medical diagnosis.
          </p>

          {submittedRef ? (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-[#DCFCE7]/50 border border-[#146C3B]/30 rounded-[6px]">
                <StatusTag label="Report received" tone="verified" />
                <p className="mt-2 text-[15px] font-bold text-[#0B1F3A] font-mono">
                  Reference no. {submittedRef}
                </p>
                <p className="mt-1 text-[13px] text-[#4A5B70]">
                  Thank you. Local health workers can now review this report without seeing your
                  personal identity.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRef(null);
                    form.reset({
                      communityId: selectedCommunityId,
                      symptoms: ['vomiting'],
                      severity: 'moderate',
                      onsetDate: daysAgoIso(1),
                      affectedCount: 1,
                      ageGroup: '18_59',
                      suspectedWaterSourceId: '',
                      notes: '',
                    });
                  }}
                  className="flex-1 h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px]"
                >
                  Submit another report
                </button>
                <Link
                  to="/reports"
                  className="h-11 px-4 border border-[#E2E8F0] rounded-[6px] text-[14px] font-medium text-[#0B1F3A] inline-flex items-center justify-center hover:bg-[#F4F6F8]"
                >
                  View my reports
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
              {loadError && (
                <div className="p-3 bg-[#FEE4E2] border border-[#B42318]/30 rounded-[6px] text-[13px] text-[#B42318]">
                  {loadError}
                </div>
              )}
              {submitError && (
                <div className="p-3 bg-[#FEE4E2] border border-[#B42318]/30 rounded-[6px] text-[13px] text-[#B42318]">
                  {submitError}
                </div>
              )}

              <div>
                <label
                  htmlFor="res-comm"
                  className="block text-[14px] font-medium text-[#0B1F3A] mb-1.5"
                >
                  Your community
                </label>
                <select
                  id="res-comm"
                  {...form.register('communityId')}
                  className="w-full h-11 px-3.5 text-[14px] text-[#0B1F3A] bg-white border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                >
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[14px] font-medium text-[#0B1F3A] mb-1.5">
                  What are you feeling?
                </label>
                <select
                  aria-label="Primary symptom"
                  value={selectedSymptoms[0] || 'vomiting'}
                  onChange={(e) => {
                    const val = e.target.value as SymptomKey;
                    const others = selectedSymptoms.slice(1).filter((s) => s !== val);
                    form.setValue('symptoms', [val, ...others], { shouldValidate: true });
                  }}
                  className="w-full h-11 px-3.5 text-[14px] text-[#0B1F3A] bg-white border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                >
                  {SYMPTOM_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {SYMPTOM_LABELS[key]}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SYMPTOM_KEYS.map((key) => {
                    const active = selectedSymptoms.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSymptom(key)}
                        className={`px-2.5 py-1 text-[12px] rounded-[4px] border transition-colors ${
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
                {form.formState.errors.symptoms && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {form.formState.errors.symptoms.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="res-start"
                  className="block text-[14px] font-medium text-[#0B1F3A] mb-1.5"
                >
                  When did it start?
                </label>
                <select
                  id="res-start"
                  value={
                    selectedOnset === daysAgoIso(0)
                      ? 'today'
                      : selectedOnset === daysAgoIso(1)
                        ? 'yesterday'
                        : selectedOnset === daysAgoIso(2)
                          ? '2days'
                          : 'custom'
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'today') form.setValue('onsetDate', daysAgoIso(0));
                    else if (v === 'yesterday') form.setValue('onsetDate', daysAgoIso(1));
                    else if (v === '2days') form.setValue('onsetDate', daysAgoIso(2));
                    else form.setValue('onsetDate', daysAgoIso(3));
                  }}
                  className="w-full h-11 px-3.5 text-[14px] text-[#0B1F3A] bg-white border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="2days">2 days ago</option>
                  <option value="custom">3 or more days ago</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="res-count"
                  className="block text-[14px] font-medium text-[#0B1F3A] mb-1.5"
                >
                  How many people are sick?
                </label>
                <input
                  id="res-count"
                  type="number"
                  min={1}
                  max={50}
                  {...form.register('affectedCount', { valueAsNumber: true })}
                  className="w-full h-11 px-3.5 text-[14px] text-[#0B1F3A] bg-white border border-[#CBD5E1] rounded-[6px] tabular-nums focus:outline-none focus:border-[#0E7C86]"
                />
                {form.formState.errors.affectedCount && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {form.formState.errors.affectedCount.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="res-ws"
                  className="block text-[14px] font-medium text-[#0B1F3A] mb-1.5"
                >
                  Where do you get your water?
                </label>
                <select
                  id="res-ws"
                  {...form.register('suspectedWaterSourceId')}
                  className="w-full h-11 px-3.5 text-[14px] text-[#0B1F3A] bg-white border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                >
                  <option value="">Not sure / Other water source</option>
                  {(selectedCommunity?.waterSources || []).map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.sourceType.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowMoreOptions((v) => !v)}
                  className="text-[12px] font-medium text-[#0E7C86] hover:underline"
                >
                  {showMoreOptions
                    ? 'Hide optional details'
                    : 'Add severity or brief note (optional)'}
                </button>

                {showMoreOptions && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-[#E2E8F0]">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                          Severity
                        </label>
                        <select
                          {...form.register('severity')}
                          className="w-full h-10 px-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white"
                        >
                          <option value="mild">Mild</option>
                          <option value="moderate">Moderate</option>
                          <option value="severe">Severe</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                          Age group
                        </label>
                        <select
                          {...form.register('ageGroup')}
                          className="w-full h-10 px-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white"
                        >
                          <option value="under_5">Under 5 years</option>
                          <option value="5_17">5–17 years</option>
                          <option value="18_59">18–59 years</option>
                          <option value="60_plus">60+ years</option>
                          <option value="mixed_household">Mixed household</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                        Optional note (do not enter names or house addresses)
                      </label>
                      <textarea
                        rows={2}
                        {...form.register('notes')}
                        className="w-full p-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full h-12 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[15px] font-semibold rounded-[6px] transition-colors disabled:opacity-60"
              >
                {form.formState.isSubmitting ? 'Sending...' : 'Send report'}
              </button>

              <p className="text-center text-[12px] text-[#4A5B70]">
                Privacy protected · No names or street addresses are collected.
              </p>
            </form>
          )}
        </section>

        {/* Community Notifications & Active Advisories */}
        {(alerts.length > 0 || notifications.length > 0) && (
          <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Community Health Advisories
                {unreadNotifs.length > 0 ? ` (${unreadNotifs.length} new)` : ''}
              </p>
              <Link to="/alerts" className="text-[12px] font-medium text-[#0E7C86] hover:underline">
                View all
              </Link>
            </div>

            {alerts.slice(0, 2).map((a) => (
              <div key={a.id} className="p-3 bg-[#F4F6F8] border border-[#E2E8F0] rounded-[6px]">
                <p className="text-[13px] font-semibold text-[#0B1F3A]">{a.title}</p>
                <p className="text-[12px] text-[#4A5B70] mt-1 leading-relaxed">
                  {a.advisoryMessageForResidents}
                </p>
              </div>
            ))}

            {notifications.slice(0, 3).map((n) => {
              const isRead = user ? n.readByUids.includes(user.id) : true;
              return (
                <div
                  key={n.id}
                  className={`p-3 border rounded-[6px] flex items-start justify-between gap-2.5 ${
                    isRead ? 'border-[#E2E8F0] bg-white' : 'border-[#0E7C86] bg-[#E6F4F5]/35'
                  }`}
                >
                  <div>
                    <p className="text-[13px] font-semibold text-[#0B1F3A]">{n.title}</p>
                    <p className="text-[12px] text-[#4A5B70] mt-0.5 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                  {!isRead && (
                    <button
                      type="button"
                      onClick={() => handleMarkNotificationRead(n.id)}
                      className="px-2 py-1 text-[11px] font-semibold text-[#0E7C86] border border-[#0E7C86] rounded-[4px] shrink-0"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Recent Submissions Tracker */}
        {myReports.length > 0 && (
          <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Recent Submissions ({myReports.length})
              </p>
              <Link to="/reports" className="text-[12px] font-medium text-[#0E7C86] hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-[#E2E8F0]">
              {myReports.slice(0, 3).map((r) => {
                const tag = verificationTagProps(r.verificationStatus);
                return (
                  <div
                    key={r.id}
                    className="py-2.5 flex items-center justify-between gap-2 text-[13px]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[12px] text-[#0B1F3A]">{r.id}</span>
                      <span className="text-[#4A5B70]"> · {r.communityName}</span>
                    </div>
                    <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
