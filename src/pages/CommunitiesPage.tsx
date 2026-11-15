import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Layout } from '../components/Layout';
import { StatusTag } from '../components/StatusText';
import { api } from '../lib/api';
import { communityCreateSchema, type Community } from '../shared/types';
import { z } from 'zod';

type CommunityFormValues = z.infer<typeof communityCreateSchema>;

export function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [showAddComm, setShowAddComm] = useState(false);
  const [wsTargetCommunity, setWsTargetCommunity] = useState('comm-makoko');
  const [wsName, setWsName] = useState('');
  const [wsType, setWsType] = useState('borehole');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const commForm = useForm<CommunityFormValues>({
    resolver: zodResolver(communityCreateSchema),
    defaultValues: {
      name: '',
      state: 'Lagos',
      lga: '',
      ward: '',
      centerLat: 6.5244,
      centerLng: 3.3792,
      radiusKm: 2.5,
      populationEstimate: 50000,
      baselineDailyReports: 1.0,
    },
  });

  const loadData = useCallback(async () => {
    try {
      const res = await api.getCommunities();
      setCommunities(res.communities);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load communities.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCommunity = async (values: CommunityFormValues) => {
    setFeedback(null);
    try {
      await api.createCommunity(values);
      setFeedback({ type: 'ok', text: `Added community "${values.name}".` });
      setShowAddComm(false);
      commForm.reset();
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to create community.',
      });
    }
  };

  const handleAddWaterSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wsName.trim().length < 2) {
      setFeedback({ type: 'err', text: 'Enter a water source name (at least 2 characters).' });
      return;
    }
    setFeedback(null);
    try {
      await api.addWaterSource(wsTargetCommunity, { name: wsName.trim(), sourceType: wsType });
      setFeedback({ type: 'ok', text: `Registered water source "${wsName.trim()}".` });
      setWsName('');
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to add water source.',
      });
    }
  };

  const handleWaterStatus = async (commId: string, wsId: string, status: string) => {
    setFeedback(null);
    try {
      await api.updateWaterSourceStatus(commId, wsId, status);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update water source.',
      });
    }
  };

  return (
    <Layout
      title="Communities"
      subtitle="Configure pilot surveillance zones, population baselines, and monitored water sources."
      headerActions={
        <button
          type="button"
          onClick={() => setShowAddComm((v) => !v)}
          className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px]"
        >
          {showAddComm ? 'Close form' : '+ Add community'}
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

        {showAddComm && (
          <section className="bg-white border border-[#0E7C86] rounded-[6px] p-5">
            <h2 className="text-[15px] font-bold text-[#0B1F3A] mb-3">New Pilot Community</h2>
            <form onSubmit={commForm.handleSubmit(handleCreateCommunity)} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <input
                  placeholder="Community name"
                  {...commForm.register('name')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {commForm.formState.errors.name && (
                  <p className="mt-1 text-[11px] text-[#B42318]">Enter community name</p>
                )}
              </div>
              <div>
                <input
                  placeholder="State"
                  {...commForm.register('state')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {commForm.formState.errors.state && (
                  <p className="mt-1 text-[11px] text-[#B42318]">Enter state</p>
                )}
              </div>
              <div>
                <input
                  placeholder="LGA"
                  {...commForm.register('lga')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {commForm.formState.errors.lga && (
                  <p className="mt-1 text-[11px] text-[#B42318]">Enter LGA</p>
                )}
              </div>
              <div>
                <input
                  placeholder="Ward"
                  {...commForm.register('ward')}
                  className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
                />
                {commForm.formState.errors.ward && (
                  <p className="mt-1 text-[11px] text-[#B42318]">Enter ward</p>
                )}
              </div>
              <input
                type="number"
                step="0.0001"
                placeholder="Latitude"
                {...commForm.register('centerLat', { valueAsNumber: true })}
                className="h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Longitude"
                {...commForm.register('centerLng', { valueAsNumber: true })}
                className="h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
              />
              <input
                type="number"
                step="0.5"
                placeholder="Radius (km)"
                {...commForm.register('radiusKm', { valueAsNumber: true })}
                className="h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
              />
              <input
                type="number"
                step="0.1"
                placeholder="Baseline/day"
                {...commForm.register('baselineDailyReports', { valueAsNumber: true })}
                className="h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] tabular-nums"
              />
              <div className="sm:col-span-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddComm(false)}
                  className="px-4 py-2 text-[13px] border border-[#E2E8F0] rounded-[6px] text-[#4A5B70]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-[13px] font-semibold bg-[#0E7C86] text-white rounded-[6px]"
                >
                  Create community
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Communities Table */}
          <section className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F4F6F8]/60 text-[12px] text-[#4A5B70]">
                    <th className="py-2.5 px-4 font-medium">Community</th>
                    <th className="py-2.5 px-4 font-medium">LGA / State</th>
                    <th className="py-2.5 px-4 font-medium text-right">Population</th>
                    <th className="py-2.5 px-4 font-medium text-right">Baseline/Day</th>
                    <th className="py-2.5 px-4 font-medium text-right">Water Sources</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/70">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#4A5B70]">
                        Loading communities...
                      </td>
                    </tr>
                  ) : (
                    communities.map((c) => (
                      <tr key={c.id} className="hover:bg-[#F4F6F8]/50">
                        <td className="py-3 px-4 font-medium text-[#0B1F3A]">{c.name}</td>
                        <td className="py-3 px-4 text-[#4A5B70]">
                          {c.lga}, {c.state}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                          {c.populationEstimate.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                          {c.baselineDailyReports}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#0B1F3A]">
                          {c.waterSources.length}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Register Water Source */}
          <section className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-[6px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70] mb-3">
              Register Water Source
            </p>
            <form onSubmit={handleAddWaterSource} className="space-y-3">
              <select
                value={wsTargetCommunity}
                onChange={(e) => setWsTargetCommunity(e.target.value)}
                className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
              >
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="Water point name"
                className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px]"
              />
              <select
                value={wsType}
                onChange={(e) => setWsType(e.target.value)}
                className="w-full h-10 px-3 text-[13px] border border-[#E2E8F0] rounded-[6px] bg-white"
              >
                <option value="borehole">Borehole</option>
                <option value="shallow_well">Shallow Well</option>
                <option value="municipal_tap">Municipal Tap</option>
                <option value="river_stream">River / Stream</option>
                <option value="sachet_vendor">Sachet Vendor</option>
              </select>
              <button
                type="submit"
                className="w-full h-10 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px]"
              >
                Add water source
              </button>
            </form>
          </section>
        </div>

        {/* Water Sources Status Table */}
        <section className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5B70]">
              Monitored Water Sources
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F4F6F8]/60 text-[12px] text-[#4A5B70]">
                  <th className="py-2.5 px-4 font-medium">Name</th>
                  <th className="py-2.5 px-4 font-medium">Community</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium">Condition</th>
                  <th className="py-2.5 px-4 font-medium text-right">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70">
                {communities.flatMap((c) =>
                  c.waterSources.map((ws) => (
                    <tr key={ws.id}>
                      <td className="py-2.5 px-4 font-medium text-[#0B1F3A]">{ws.name}</td>
                      <td className="py-2.5 px-4 text-[#4A5B70]">{c.name}</td>
                      <td className="py-2.5 px-4 text-[#4A5B70] capitalize">
                        {ws.sourceType.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusTag
                          label={ws.status.replace('_', ' ')}
                          tone={
                            ws.status === 'tested_contaminated'
                              ? 'high'
                              : ws.status === 'suspected'
                                ? 'elevated'
                                : ws.status === 'operational'
                                  ? 'verified'
                                  : 'statistical'
                          }
                        />
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <select
                          aria-label={`Status for ${ws.name}`}
                          value={ws.status}
                          onChange={(e) => handleWaterStatus(c.id, ws.id, e.target.value)}
                          className="h-8 px-2 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white"
                        >
                          <option value="operational">Operational</option>
                          <option value="suspected">Suspected</option>
                          <option value="tested_contaminated">Contaminated</option>
                          <option value="closed_treated">Closed / Treated</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}
