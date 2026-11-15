import { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { StatusTag } from '../components/StatusText';
import { api } from '../lib/api';
import type { Community, UserProfile, UserRole } from '../shared/types';

export function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [uRes, cRes] = await Promise.all([api.getAdminUsers(), api.getCommunities()]);
      setUsers(uRes.users);
      setCommunities(cRes.communities);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load users.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setFeedback(null);
    try {
      await api.updateAdminUser(userId, { role });
      setFeedback({ type: 'ok', text: 'User role updated.' });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Role update failed.',
      });
    }
  };

  const handleToggleCommunity = async (user: UserProfile, communityId: string) => {
    setFeedback(null);
    const exists = user.assignedCommunityIds.includes(communityId);
    const next = exists
      ? user.assignedCommunityIds.filter((id) => id !== communityId)
      : [...user.assignedCommunityIds, communityId];
    try {
      await api.updateAdminUser(user.id, { assignedCommunityIds: next });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Community assignment failed.',
      });
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    setFeedback(null);
    try {
      await api.updateAdminUser(user.id, { active: !user.active });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Account update failed.',
      });
    }
  };

  return (
    <Layout
      title="Users"
      subtitle="Manage role-based access control and community assignments."
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

        <section className="bg-white border border-[#E2E8F0] rounded-[6px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F4F6F8]/60 text-[12px] text-[#4A5B70]">
                  <th className="py-2.5 px-4 font-medium">User</th>
                  <th className="py-2.5 px-4 font-medium">Role</th>
                  <th className="py-2.5 px-4 font-medium">Authorized Communities</th>
                  <th className="py-2.5 px-4 font-medium text-right">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#4A5B70]">
                      Loading user directory...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#0B1F3A]">{u.displayName}</p>
                        <p className="text-[12px] font-mono text-[#4A5B70]">{u.email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          aria-label={`Role for ${u.displayName}`}
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="h-9 px-2.5 text-[12px] border border-[#E2E8F0] rounded-[6px] bg-white"
                        >
                          <option value="resident">Resident</option>
                          <option value="health_worker">Health Worker</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {communities.map((c) => {
                            const assigned = u.assignedCommunityIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleToggleCommunity(u, c.id)}
                                className={`px-2 py-1 text-[11px] font-medium rounded-[4px] border transition-colors ${
                                  assigned
                                    ? 'bg-[#E0F2FE] border-[#0E7C86] text-[#0E7C86]'
                                    : 'bg-white border-[#E2E8F0] text-[#4A5B70] hover:border-[#CBD5E1]'
                                }`}
                              >
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className="inline-flex items-center"
                        >
                          <StatusTag
                            label={u.active ? 'Active' : 'Disabled'}
                            tone={u.active ? 'verified' : 'high'}
                            showShape={false}
                          />
                        </button>
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
