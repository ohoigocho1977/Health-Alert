import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layout } from '../components/Layout';
import { StatusTag, classificationTagProps } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import {
  CLASSIFICATION_LABELS,
  alertCreateSchema,
  type AlertRecord,
  type Community,
  type NotificationItem,
} from '../shared/types';
import { z } from 'zod';

type AlertFormValues = z.infer<typeof alertCreateSchema>;

export function AlertsPage() {
  const { user } = useAuth();
  const { selectedCommunityId, searchQuery } = useGlobalFilter();
  const isAdmin = user?.role === 'admin';

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const form = useForm<AlertFormValues>({
    resolver: zodResolver(alertCreateSchema),
    defaultValues: {
      communityId: 'comm-makoko',
      title: '',
      severity: 'warning',
      classification: 'potential_health_threat',
      summary: '',
      advisoryMessageForResidents: '',
      linkedReportIds: [],
    },
  });

  const loadData = useCallback(async () => {
    try {
      const [alertRes, notifRes, commRes] = await Promise.all([
        api.getAlerts(),
        api.getNotifications(),
        api.getCommunities(),
      ]);
      setAlerts(alertRes.alerts);
      setNotifications(notifRes.notifications);
      setCommunities(commRes.communities);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load alerts.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (values: AlertFormValues) => {
    setFeedback(null);
    try {
      await api.createAlert(values);
      setFeedback({ type: 'ok', text: 'Alert issued and resident advisory published.' });
      setShowCreate(false);
      form.reset();
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to create alert.',
      });
    }
  };

  const handleStatus = async (id: string, status: string) => {
    setFeedback(null);
    try {
      await api.updateAlertStatus(id, status);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update alert status.',
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

  const q = searchQuery.trim().toLowerCase();
  const visibleAlerts = alerts.filter((a) => {
    if (selectedCommunityId && a.communityId !== selectedCommunityId) return false;
    if (!q) return true;
    return (
      a.title.toLowerCase().includes(q) ||
      a.communityName.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q)
    );
  });

  const visibleNotifications = notifications.filter((n) => {
    if (selectedCommunityId && n.targetCommunityId && n.targetCommunityId !== selectedCommunityId) {
      return false;
    }
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
  });

  const unreadCount = user
    ? visibleNotifications.filter((n) => !n.readByUids.includes(user.id)).length
    : 0;

  return (
    <Layout
      title={user?.role === 'resident' ? 'Public Health Advisories' : 'Alerts & Notifications'}
      subtitle={
        user?.role === 'resident'
          ? 'Official health notices, notifications, and safe-water guidance for your community.'
          : 'Manage active public health alerts, resident advisories, and role notifications.'
      }
      headerActions={
        isAdmin ? (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px]"
          >
            {showCreate ? 'Close form' : 'Issue alert'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-5">
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

        {isAdmin && showCreate && (
          <section className="bg-white border border-[#0E7C86] rounded-[6px] p-5">
            <h2 className="text-[15px] font-bold text-[#0B1F3A] mb-3">Issue Public Health Alert</h2>
            <form
              onSubmit={form.handleSubmit(handleCreate)}
              className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
            >
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                  Community
                </label>
                <select
                  {...form.register('communityId')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
                >
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                  Alert Title
                </label>
                <input
                  type="text"
                  {...form.register('title')}
                  placeholder="e.g. Boil-Water Advisory around Ward 3 Well"
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {form.formState.errors.title && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                  Severity
                </label>
                <select
                  {...form.register('severity')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
                >
                  <option value="advisory">Advisory</option>
                  <option value="watch">Watch</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                  Classification
                </label>
                <select
                  {...form.register('classification')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
                >
                  <option value="unusual_reporting_activity">Unusual Reporting Activity</option>
                  <option value="potential_health_threat">Potential Health Threat</option>
                  <option value="human_verified_incident">Human-Verified Incident</option>
                  <option value="officially_confirmed_outbreak">
                    Officially Confirmed Outbreak
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                  Operational Summary
                </label>
                <textarea
                  rows={2}
                  {...form.register('summary')}
                  className="w-full p-2.5 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {form.formState.errors.summary && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {form.formState.errors.summary.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                  Resident Advisory Message
                </label>
                <textarea
                  rows={2}
                  {...form.register('advisoryMessageForResidents')}
                  className="w-full p-2.5 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {form.formState.errors.advisoryMessageForResidents && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {form.formState.errors.advisoryMessageForResidents.message}
                  </p>
                )}
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-[13px] border border-[#E2E8F0] rounded-[6px] text-[#4A5B70]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-[13px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                >
                  Publish alert
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Active Public Health Alerts */}
        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-8 text-center text-[13px] text-[#4A5B70]">
            Loading alerts and notifications...
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                  Public Health Alerts ({visibleAlerts.length})
                </h2>
              </div>

              {visibleAlerts.length === 0 ? (
                <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 text-center text-[13px] text-[#4A5B70]">
                  No alerts match your current filter.
                </div>
              ) : (
                visibleAlerts.map((a) => {
                  const classTag = classificationTagProps(a.classification);
                  const isHigh = a.severity === 'critical' || a.severity === 'warning';
                  return (
                    <article
                      key={a.id}
                      className={`bg-white border rounded-[6px] p-5 ${
                        a.status !== 'resolved' && isHigh ? 'border-[#B42318]' : 'border-[#E2E8F0]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusTag
                              label={a.severity.toUpperCase()}
                              tone={isHigh ? 'high' : 'elevated'}
                            />
                            <StatusTag
                              label={CLASSIFICATION_LABELS[a.classification]}
                              tone={classTag.tone}
                              showShape={classTag.showShape}
                            />
                            <span className="text-[12px] text-[#4A5B70] font-mono">{a.id}</span>
                          </div>
                          <h3 className="mt-2 text-[16px] font-bold text-[#0B1F3A]">{a.title}</h3>
                          <p className="text-[12px] text-[#4A5B70] mt-0.5 tabular-nums">
                            {a.communityName} · {new Date(a.createdAt).toLocaleString()} · Status:{' '}
                            <span className="font-medium capitalize text-[#0B1F3A]">
                              {a.status}
                            </span>
                          </p>
                        </div>

                        {(isAdmin || user?.role === 'health_worker') && a.status !== 'resolved' && (
                          <div className="flex items-center gap-2">
                            {a.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleStatus(a.id, 'acknowledged')}
                                className="px-3 py-1.5 text-[12px] font-medium border border-[#E2E8F0] rounded-[6px] text-[#0B1F3A] hover:bg-[#F4F6F8]"
                              >
                                Acknowledge
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleStatus(a.id, 'resolved')}
                                className="px-3 py-1.5 text-[12px] font-medium border border-[#146C3B]/40 text-[#146C3B] rounded-[6px] hover:bg-[#DCFCE7]/40"
                              >
                                Resolve alert
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-[13px] text-[#0B1F3A] leading-relaxed">
                        {a.summary}
                      </p>
                      <div className="mt-3 p-3 bg-[#F4F6F8] border border-[#E2E8F0] rounded-[6px] text-[13px] text-[#0B1F3A]">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] block mb-1">
                          Resident Public Advisory
                        </span>
                        {a.advisoryMessageForResidents}
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            {/* Targeted Notifications Feed */}
            <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                  Notifications & Guidance ({visibleNotifications.length})
                </h2>
                {unreadCount > 0 && (
                  <span className="text-[12px] font-semibold text-[#0E7C86] tabular-nums">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              {visibleNotifications.length === 0 ? (
                <p className="text-[13px] text-[#4A5B70]">
                  No notifications match your current community filter.
                </p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {visibleNotifications.map((n) => {
                    const isRead = user ? n.readByUids.includes(user.id) : true;
                    const commName = n.targetCommunityId
                      ? communities.find((c) => c.id === n.targetCommunityId)?.name
                      : 'All Communities';
                    return (
                      <div
                        key={n.id}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          !isRead ? 'bg-[#E6F4F5]/35 -mx-2 px-2 rounded-[4px]' : ''
                        }`}
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusTag
                              label={n.severity === 'warning' ? 'Warning' : n.severity === 'advisory' ? 'Advisory' : 'Notice'}
                              tone={
                                n.severity === 'warning'
                                  ? 'high'
                                  : n.severity === 'advisory'
                                    ? 'elevated'
                                    : 'statistical'
                              }
                            />
                            <span className="text-[12px] text-[#4A5B70]">
                              {commName} · {new Date(n.createdAt).toLocaleString()}
                            </span>
                            {!isRead && (
                              <span className="text-[11px] font-semibold text-[#0E7C86]">
                                Unread
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-[14px] font-semibold text-[#0B1F3A]">
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-[13px] text-[#4A5B70]">{n.message}</p>
                        </div>

                        {!isRead && (
                          <button
                            type="button"
                            onClick={() => handleMarkNotificationRead(n.id)}
                            className="h-8 px-3 text-[12px] font-medium border border-[#0E7C86] text-[#0E7C86] hover:bg-[#E6F4F5] rounded-[6px] shrink-0 self-start sm:self-center"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
