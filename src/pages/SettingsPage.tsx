import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layout } from '../components/Layout';
import { StatusTag } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  thresholdConfigSchema,
  type AuditLog,
  type ThresholdConfig,
} from '../shared/types';
import { z } from 'zod';

type ThresholdFormValues = z.infer<typeof thresholdConfigSchema>;

export function SettingsPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const form = useForm<ThresholdFormValues>({
    resolver: zodResolver(thresholdConfigSchema),
  });

  const loadData = useCallback(async () => {
    try {
      const intelRes = await api.getIntelligenceSummary();
      form.reset(intelRes.thresholdConfig);
      if (isAdmin) {
        const logRes = await api.getAuditLogs();
        setAuditLogs(logRes.auditLogs);
      }
    } catch {
      // ignore
    }
  }, [form, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveThresholds = async (values: ThresholdConfig) => {
    setFeedback(null);
    try {
      await api.updateThresholds(values);
      setFeedback({ type: 'ok', text: 'Detection threshold parameters saved.' });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save thresholds.',
      });
    }
  };

  const handleResetDemo = async () => {
    setFeedback(null);
    try {
      await api.resetDemo();
      setFeedback({ type: 'ok', text: 'Demonstration dataset restored to initial baseline.' });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to reset demonstration data.',
      });
    }
  };

  return (
    <Layout
      title="Settings"
      subtitle="Account profile, configurable statistical parameters, and administrative audit logs."
      showDemoBadge={false}
    >
      <div className="space-y-4">
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

        {/* Profile Card */}
        <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Profile & Session
            </p>
            <h2 className="mt-1.5 text-[16px] font-bold text-[#0B1F3A]">{user?.displayName}</h2>
            <p className="text-[13px] text-[#4A5B70] mt-0.5">
              {user?.email} · Role: <span className="capitalize font-medium text-[#0B1F3A]">{user?.role.replace('_', ' ')}</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusTag label="Session active" tone="verified" />
            <button
              type="button"
              onClick={() => logout()}
              className="h-9 px-3.5 border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#B42318] hover:bg-[#FEE4E2]/40"
            >
              Sign out
            </button>
          </div>
        </section>

        {/* Admin Thresholds + Demo Reset */}
        {isAdmin && (
          <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                  Statistical Engine Parameters
                </p>
                <p className="text-[12px] text-[#4A5B70] mt-0.5">
                  Configurable pilot thresholds (non-diagnostic screening parameters).
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDemo}
                className="h-9 px-3.5 border border-[#E2E8F0] rounded-[6px] text-[12px] font-medium text-[#0B1F3A] hover:bg-[#F4F6F8]"
              >
                Reset demonstration dataset
              </button>
            </div>

            <form
              onSubmit={form.handleSubmit(handleSaveThresholds)}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[
                { name: 'windowHours', label: 'Window (hours)' },
                { name: 'baselineDays', label: 'Baseline (days)' },
                { name: 'volumeMultiplierThreshold', label: 'Volume multiplier (x)' },
                { name: 'zScoreThreshold', label: 'Z-score threshold (σ)' },
                { name: 'clusterRadiusMeters', label: 'Cluster radius (m)' },
                { name: 'clusterMinReports', label: 'Min cluster reports' },
                { name: 'waterSourceConcentrationThreshold', label: 'Water source threshold' },
                { name: 'minReportsForAnomaly', label: 'Min reports floor' },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    {f.label}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...form.register(f.name as keyof ThresholdFormValues, {
                      valueAsNumber: true,
                    })}
                    className="w-full h-9 px-2.5 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
                  />
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4 flex justify-end pt-2">
                <button
                  type="submit"
                  className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px]"
                >
                  Save parameters
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Audit Logs */}
        {isAdmin && (
          <section className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E8F0]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                Security & Audit Trail
              </p>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F4F6F8]/60 text-[#4A5B70]">
                    <th className="py-2 px-4 font-medium">Time</th>
                    <th className="py-2 px-4 font-medium">Actor</th>
                    <th className="py-2 px-4 font-medium">Action</th>
                    <th className="py-2 px-4 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/70">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 px-4 font-mono tabular-nums text-[#4A5B70] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-[#0B1F3A] whitespace-nowrap">
                        {log.actorEmail}
                      </td>
                      <td className="py-2 px-4 font-mono text-[#0B1F3A] whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-2 px-4 text-[#4A5B70]">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
