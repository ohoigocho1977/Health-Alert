import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layout } from '../components/Layout';
import { StatusTag } from '../components/StatusText';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import {
  interventionCreateSchema,
  investigationCreateSchema,
  type Community,
  type Intervention,
  type Investigation,
} from '../shared/types';
import { z } from 'zod';

type InvFormValues = z.infer<typeof investigationCreateSchema>;
type IntFormValues = z.infer<typeof interventionCreateSchema>;

export function InvestigationsPage() {
  const { selectedCommunityId, searchQuery } = useGlobalFilter();
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [showNewInv, setShowNewInv] = useState(false);
  const [activeInvIdForInt, setActiveInvIdForInt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const invForm = useForm<InvFormValues>({
    resolver: zodResolver(investigationCreateSchema),
    defaultValues: {
      communityId: 'comm-makoko',
      title: '',
      priority: 'elevated',
      findingsSummary: '',
      linkedReportIds: [],
    },
  });

  const intForm = useForm<IntFormValues>({
    resolver: zodResolver(interventionCreateSchema),
    defaultValues: {
      investigationId: '',
      actionType: 'water_chlorination',
      description: '',
      householdsReached: 10,
      status: 'completed',
    },
  });

  const loadData = useCallback(async () => {
    try {
      const [invRes, commRes] = await Promise.all([api.getInvestigations(), api.getCommunities()]);
      setInvestigations(invRes.investigations);
      setInterventions(invRes.interventions);
      setCommunities(commRes.communities);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load investigations.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateInv = async (values: InvFormValues) => {
    setFeedback(null);
    try {
      await api.createInvestigation(values);
      setFeedback({ type: 'ok', text: 'Investigation created and assigned.' });
      setShowNewInv(false);
      invForm.reset();
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to create investigation.',
      });
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    setFeedback(null);
    try {
      await api.updateInvestigation(id, { status });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update investigation status.',
      });
    }
  };

  const handleCreateInt = async (values: IntFormValues) => {
    setFeedback(null);
    try {
      await api.createIntervention(values);
      setFeedback({ type: 'ok', text: 'Field intervention documented.' });
      setActiveInvIdForInt(null);
      intForm.reset();
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to log intervention.',
      });
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const visible = investigations.filter((inv) => {
    if (selectedCommunityId && inv.communityId !== selectedCommunityId) return false;
    if (!q) return true;
    return (
      inv.id.toLowerCase().includes(q) ||
      inv.title.toLowerCase().includes(q) ||
      inv.communityName.toLowerCase().includes(q)
    );
  });

  return (
    <Layout
      title="Investigations"
      subtitle="Track field dispatches, water sampling, and documented community interventions."
      headerActions={
        <button
          type="button"
          onClick={() => setShowNewInv((v) => !v)}
          className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px]"
        >
          {showNewInv ? 'Close form' : 'Start investigation'}
        </button>
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

        {showNewInv && (
          <section className="bg-white border border-[#0E7C86] rounded-[6px] p-5">
            <h2 className="text-[15px] font-bold text-[#0B1F3A] mb-3">Open Field Investigation</h2>
            <form onSubmit={invForm.handleSubmit(handleCreateInv)} className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">Community</label>
                <select
                  {...invForm.register('communityId')}
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
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">Title</label>
                <input
                  type="text"
                  {...invForm.register('title')}
                  placeholder="e.g. Ward 3 Borehole Sampling"
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {invForm.formState.errors.title && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {invForm.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">Priority</label>
                <select
                  {...invForm.register('priority')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
                >
                  <option value="routine">Routine</option>
                  <option value="elevated">Elevated</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[12px] font-medium text-[#4A5B70] mb-1">Findings / Scope</label>
                <textarea
                  rows={2}
                  {...invForm.register('findingsSummary')}
                  className="w-full p-2.5 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {invForm.formState.errors.findingsSummary && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {invForm.formState.errors.findingsSummary.message}
                  </p>
                )}
              </div>
              <div className="md:col-span-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewInv(false)}
                  className="px-4 py-2 text-[13px] border border-[#E2E8F0] rounded-[6px] text-[#4A5B70]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-[13px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                >
                  Create investigation
                </button>
              </div>
            </form>
          </section>
        )}

        {loading ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-8 text-center text-[13px] text-[#4A5B70]">
            Loading investigations...
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-8 text-center text-[13px] text-[#4A5B70]">
            No investigations found.
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((inv) => {
              const invInterventions = interventions.filter((iv) => iv.investigationId === inv.id);
              return (
                <article
                  key={inv.id}
                  className={`bg-white border rounded-[6px] p-5 ${
                    inv.priority === 'urgent' && inv.status !== 'closed'
                      ? 'border-[#B42318]'
                      : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusTag
                          label={inv.priority.charAt(0).toUpperCase() + inv.priority.slice(1)}
                          tone={inv.priority === 'urgent' ? 'high' : inv.priority === 'elevated' ? 'elevated' : 'statistical'}
                        />
                        <span className="font-mono text-[12px] text-[#4A5B70]">{inv.id}</span>
                        <span className="text-[12px] text-[#4A5B70]">· {inv.communityName}</span>
                      </div>
                      <h2 className="mt-2 text-[16px] font-bold text-[#0B1F3A]">{inv.title}</h2>
                      <p className="text-[12px] text-[#4A5B70] mt-0.5">
                        Lead: {inv.leadWorkerName || 'Unassigned'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Status for ${inv.title}`}
                        value={inv.status}
                        onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                        className="h-9 px-3 text-[12px] font-medium border border-[#E2E8F0] rounded-[6px] bg-white text-[#0B1F3A]"
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
                          setActiveInvIdForInt(inv.id);
                          intForm.setValue('investigationId', inv.id);
                        }}
                        className="h-9 px-3 text-[12px] font-semibold bg-[#0E7C86] text-white rounded-[6px] hover:bg-[#0B666E]"
                      >
                        Log intervention
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-[13px] text-[#0B1F3A] leading-relaxed">
                    {inv.findingsSummary}
                  </p>

                  {activeInvIdForInt === inv.id && (
                    <form
                      onSubmit={intForm.handleSubmit(handleCreateInt)}
                      className="mt-4 p-4 bg-[#F4F6F8] border border-[#E2E8F0] rounded-[6px] space-y-3"
                    >
                      <p className="text-[12px] font-semibold text-[#0B1F3A]">
                        Document Field Intervention
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select
                          {...intForm.register('actionType')}
                          className="h-9 px-2.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white"
                        >
                          <option value="ors_distribution">ORS / Zinc Distribution</option>
                          <option value="water_chlorination">Water Chlorination</option>
                          <option value="boil_water_advisory">Boil-Water Advisory</option>
                          <option value="source_closure">Source Closure</option>
                          <option value="hygiene_sensitization">Hygiene Sensitization</option>
                          <option value="sample_lab_referral">Lab Sample Referral</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          placeholder="Households reached"
                          {...intForm.register('householdsReached', { valueAsNumber: true })}
                          className="h-9 px-2.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white tabular-nums"
                        />
                        <select
                          {...intForm.register('status')}
                          className="h-9 px-2.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white"
                        >
                          <option value="planned">Planned</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Describe action completed..."
                        {...intForm.register('description')}
                        className="w-full p-2.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white"
                      />
                      {intForm.formState.errors.description && (
                        <p className="text-[12px] text-[#B42318]">
                          {intForm.formState.errors.description.message}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveInvIdForInt(null)}
                          className="px-3 py-1.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white text-[#4A5B70]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 text-[12px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                        >
                          Save intervention
                        </button>
                      </div>
                    </form>
                  )}

                  {invInterventions.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#E2E8F0] space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
                        Documented Responses ({invInterventions.length})
                      </p>
                      {invInterventions.map((iv) => (
                        <div
                          key={iv.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#0B1F3A]"
                        >
                          <span>
                            <strong className="capitalize">{iv.actionType.replace(/_/g, ' ')}:</strong>{' '}
                            {iv.description}
                          </span>
                          <span className="font-mono text-[#4A5B70] tabular-nums">
                            {iv.householdsReached} households · {iv.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
