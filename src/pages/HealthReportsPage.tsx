import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusTag, verificationTagProps } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import {
  SYMPTOM_LABELS,
  fieldVerificationSchema,
  type HealthReport,
} from '../shared/types';
import { z } from 'zod';

type VerifyFormValues = z.infer<typeof fieldVerificationSchema>;

export function HealthReportsPage() {
  const { user } = useAuth();
  const { searchQuery, selectedCommunityId } = useGlobalFilter();
  const canVerify = user?.role === 'health_worker' || user?.role === 'admin';

  const [reports, setReports] = useState<HealthReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'awaiting' | 'verified' | 'resolved'>('all');
  const [selectedReport, setSelectedReport] = useState<HealthReport | null>(null);
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

  const loadReports = useCallback(async () => {
    try {
      const res = await api.getReports();
      setReports(res.reports);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      if (selectedCommunityId && r.communityId !== selectedCommunityId) return false;
      if (statusFilter === 'awaiting') {
        if (r.verificationStatus !== 'pending' && r.verificationStatus !== 'under_review') return false;
      } else if (statusFilter === 'verified') {
        if (r.verificationStatus !== 'verified') return false;
      } else if (statusFilter === 'resolved') {
        if (r.verificationStatus !== 'resolved' && r.verificationStatus !== 'unconfirmed') return false;
      }
      if (!q) return true;
      const symptomsStr = r.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(' ').toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.communityName.toLowerCase().includes(q) ||
        symptomsStr.includes(q) ||
        (r.suspectedWaterSourceLabel || '').toLowerCase().includes(q)
      );
    });
  }, [reports, selectedCommunityId, statusFilter, searchQuery]);

  const openVerify = (rep: HealthReport) => {
    setSelectedReport(rep);
    verifyForm.reset({
      reportId: rep.id,
      outcome: 'confirmed_cluster',
      waterSampleTaken: false,
      clinicalNotes: '',
      householdsVisited: 1,
    });
  };

  const onSubmitVerify = async (values: VerifyFormValues) => {
    setFeedback(null);
    try {
      await api.submitVerification(values);
      setFeedback({ type: 'ok', text: `Verification saved for ${values.reportId}.` });
      setSelectedReport(null);
      await loadReports();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save verification.',
      });
    }
  };

  return (
    <Layout
      title={user?.role === 'resident' ? 'My Reports' : 'Health Reports'}
      subtitle={
        user?.role === 'resident'
          ? 'Track the verification status of your submitted symptom reports.'
          : 'Submitted community and field reports scoped to your authorized communities.'
      }
      headerActions={
        <Link
          to={user?.role === 'resident' ? '/resident' : '/resident'}
          className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px] inline-flex items-center"
        >
          + Submit report
        </Link>
      }
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

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#E2E8F0] rounded-[6px]">
            {(
              [
                { id: 'all', label: 'All reports' },
                { id: 'awaiting', label: 'Awaiting review' },
                { id: 'verified', label: 'Verified' },
                { id: 'resolved', label: 'Resolved' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-[4px] transition-colors ${
                  statusFilter === t.id
                    ? 'bg-[#0B1F3A] text-white'
                    : 'text-[#4A5B70] hover:text-[#0B1F3A]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-[#4A5B70] tabular-nums">
            {filtered.length} matching reports
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Table */}
          <div
            className={`${
              selectedReport ? 'xl:col-span-8' : 'xl:col-span-12'
            } bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F4F6F8]/60 text-[12px] text-[#4A5B70]">
                    <th className="py-2.5 px-4 font-medium">ID</th>
                    <th className="py-2.5 px-4 font-medium">Community</th>
                    <th className="py-2.5 px-4 font-medium">Symptoms</th>
                    <th className="py-2.5 px-4 font-medium">Water Source</th>
                    <th className="py-2.5 px-4 font-medium text-right">People</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    {canVerify && <th className="py-2.5 px-4 font-medium text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/70">
                  {loading ? (
                    <tr>
                      <td colSpan={canVerify ? 7 : 6} className="py-8 text-center text-[#4A5B70]">
                        Loading health reports...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={canVerify ? 7 : 6} className="py-8 text-center text-[#4A5B70]">
                        No reports match the active filter.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((rep) => {
                      const tag = verificationTagProps(rep.verificationStatus);
                      return (
                        <tr key={rep.id} className="hover:bg-[#F4F6F8]/50">
                          <td className="py-3 px-4 font-mono text-[12px] text-[#0B1F3A] whitespace-nowrap">
                            {rep.id}
                          </td>
                          <td className="py-3 px-4 text-[#0B1F3A] whitespace-nowrap">
                            {rep.communityName}
                          </td>
                          <td className="py-3 px-4 text-[#0B1F3A]">
                            {rep.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ')}
                          </td>
                          <td className="py-3 px-4 text-[#4A5B70]">
                            {rep.suspectedWaterSourceLabel || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                            {rep.affectedCount}
                          </td>
                          <td className="py-3 px-4">
                            <StatusTag label={tag.label} tone={tag.tone} showShape={tag.showShape} />
                          </td>
                          {canVerify && (
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openVerify(rep)}
                                className="px-2.5 py-1 text-[12px] font-medium border border-[#E2E8F0] rounded-[6px] text-[#0B1F3A] hover:border-[#0E7C86] hover:text-[#0E7C86]"
                              >
                                Verify
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Field Verification Side Panel */}
          {canVerify && selectedReport && (
            <aside className="xl:col-span-4 bg-white border border-[#0E7C86] rounded-[6px] p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0E7C86]">
                    Field Verification
                  </p>
                  <p className="text-[15px] font-bold text-[#0B1F3A] mt-0.5 font-mono">
                    {selectedReport.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="text-[12px] text-[#4A5B70] hover:text-[#0B1F3A]"
                >
                  Close
                </button>
              </div>

              <div className="text-[12px] text-[#4A5B70] space-y-1">
                <p>
                  <strong className="text-[#0B1F3A]">Community:</strong> {selectedReport.communityName}
                </p>
                <p>
                  <strong className="text-[#0B1F3A]">Symptoms:</strong>{' '}
                  {selectedReport.symptoms.map((s) => SYMPTOM_LABELS[s] || s).join(', ')}
                </p>
                {selectedReport.notes && (
                  <p>
                    <strong className="text-[#0B1F3A]">Notes:</strong> {selectedReport.notes}
                  </p>
                )}
              </div>

              <form onSubmit={verifyForm.handleSubmit(onSubmitVerify)} className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    Verification Outcome
                  </label>
                  <select
                    {...verifyForm.register('outcome')}
                    className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
                  >
                    <option value="confirmed_cluster">Confirmed Cluster</option>
                    <option value="requires_lab_test">Requires Lab Test</option>
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
                      className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
                    />
                  </div>
                  <label className="flex items-end pb-2.5 gap-2 text-[13px] text-[#0B1F3A] cursor-pointer">
                    <input
                      type="checkbox"
                      {...verifyForm.register('waterSampleTaken')}
                      className="w-4 h-4 rounded border-[#CBD5E1]"
                    />
                    <span>Water sample</span>
                  </label>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">
                    Clinical & Field Notes
                  </label>
                  <textarea
                    rows={3}
                    {...verifyForm.register('clinicalNotes')}
                    className="w-full p-2.5 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                    placeholder="Record household findings and actions taken..."
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
                  className="w-full h-10 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px]"
                >
                  Save verification
                </button>
              </form>
            </aside>
          )}
        </div>
      </div>
    </Layout>
  );
}
