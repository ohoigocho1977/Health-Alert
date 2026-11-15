import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, Plus, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { StatusTag } from '../components/StatusText';
import { api } from '../lib/api';
import {
  adminCreateUserSchema,
  type Community,
  type UserProfile,
  type UserRole,
} from '../shared/types';
import { z } from 'zod';

type CreateUserValues = z.infer<typeof adminCreateUserSchema>;

export function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(adminCreateUserSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      role: 'health_worker',
      assignedCommunityIds: [],
    },
  });

  const loadData = useCallback(async () => {
    try {
      const [uRes, cRes] = await Promise.all([api.getAdminUsers(), api.getCommunities()]);
      setUsers(uRes.users);
      setCommunities(cRes.communities);
      const currentAssigned = form.getValues('assignedCommunityIds');
      if (currentAssigned.length === 0 && cRes.communities.length > 0) {
        form.setValue('assignedCommunityIds', [cRes.communities[0].id]);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load users.',
      });
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateUser = async (values: CreateUserValues) => {
    setFeedback(null);
    try {
      const res = await api.createAdminUser(values);
      setFeedback({
        type: 'ok',
        text: `Provisioned ${res.user.role.replace('_', ' ')} account for ${res.user.email}.`,
      });
      form.reset({
        displayName: '',
        email: '',
        password: '',
        role: 'health_worker',
        assignedCommunityIds: communities[0] ? [communities[0].id] : [],
      });
      setShowCreateForm(false);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to provision account.',
      });
    }
  };

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

  const selectedCreateCommunities = form.watch('assignedCommunityIds');

  const toggleCreateCommunity = (id: string) => {
    const next = selectedCreateCommunities.includes(id)
      ? selectedCreateCommunities.filter((item) => item !== id)
      : [...selectedCreateCommunities, id];
    form.setValue('assignedCommunityIds', next, { shouldValidate: true });
  };

  return (
    <Layout
      title="Users"
      subtitle="Manage role-based access control, account provisioning, and community assignments."
      headerActions={
        <button
          type="button"
          onClick={() => {
            setShowCreateForm((prev) => !prev);
            setFeedback(null);
          }}
          className="h-9 px-3.5 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px] inline-flex items-center gap-1.5"
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{showCreateForm ? 'Close form' : 'Provision account'}</span>
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

        {showCreateForm && (
          <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-5">
            <h2 className="text-[15px] font-bold text-[#0B1F3A]">Provision Staff or User Account</h2>
            <p className="text-[12px] text-[#4A5B70] mt-0.5 mb-4">
              Create an authenticated account with explicit role and community permissions.
            </p>
            <form onSubmit={form.handleSubmit(handleCreateUser)} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#0B1F3A] mb-1" htmlFor="create-name">
                    Display name
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    {...form.register('displayName')}
                    className="w-full h-9 px-3 text-[13px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                    placeholder="e.g. Musa Ibrahim"
                  />
                  {form.formState.errors.displayName && (
                    <p className="mt-1 text-[11px] text-[#B42318]">
                      {form.formState.errors.displayName.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#0B1F3A] mb-1" htmlFor="create-email">
                    Email address
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    {...form.register('email')}
                    className="w-full h-9 px-3 text-[13px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                    placeholder="staff@healthalert.ng"
                  />
                  {form.formState.errors.email && (
                    <p className="mt-1 text-[11px] text-[#B42318]">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#0B1F3A] mb-1" htmlFor="create-password">
                    Initial password
                  </label>
                  <div className="relative">
                    <input
                      id="create-password"
                      type={showPassword ? 'text' : 'password'}
                      {...form.register('password')}
                      className="w-full h-9 pl-3 pr-9 text-[13px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                      placeholder="8+ chars, letter + number"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-[#4A5B70] hover:text-[#0B1F3A]"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="mt-1 text-[11px] text-[#B42318]">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#0B1F3A] mb-1" htmlFor="create-role">
                    Assigned role
                  </label>
                  <select
                    id="create-role"
                    {...form.register('role')}
                    className="w-full h-9 px-2.5 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white focus:outline-none focus:border-[#0E7C86]"
                  >
                    <option value="resident">Community Resident</option>
                    <option value="health_worker">Community Health Worker</option>
                    <option value="admin">Health Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="text-[12px] font-medium text-[#0B1F3A] mb-1.5">Authorized communities</p>
                <div className="flex flex-wrap gap-1.5">
                  {communities.map((c) => {
                    const active = selectedCreateCommunities.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCreateCommunity(c.id)}
                        className={`px-2.5 py-1 text-[12px] font-medium rounded-[4px] border transition-colors ${
                          active
                            ? 'bg-[#E0F2FE] border-[#0E7C86] text-[#0E7C86]'
                            : 'bg-white border-[#E2E8F0] text-[#4A5B70]'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {form.formState.errors.assignedCommunityIds && (
                  <p className="mt-1 text-[11px] text-[#B42318]">
                    {form.formState.errors.assignedCommunityIds.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="h-9 px-3.5 border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#4A5B70] hover:bg-[#F4F6F8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="h-9 px-4 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[13px] font-semibold rounded-[6px] disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {form.formState.isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{form.formState.isSubmitting ? 'Creating...' : 'Create account'}</span>
                </button>
              </div>
            </form>
          </section>
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
