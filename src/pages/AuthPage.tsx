import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  loginSchema,
  registerSchema,
  type Community,
} from '../shared/types';
import { z } from 'zod';

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

const DEMO_ACCOUNTS = [
  {
    label: 'Health Administrator',
    subtitle: 'Overview, Risk Intelligence, Alerts, Governance',
    email: 'admin@healthalert.ng',
  },
  {
    label: 'Community Health Worker',
    subtitle: 'Today Field Tasks, Verification & Interventions',
    email: 'chw.makoko@healthalert.ng',
  },
  {
    label: 'Community Resident',
    subtitle: '1-Minute Problem Reporting & Community Advisories',
    email: 'resident@healthalert.ng',
  },
];

export function AuthPage() {
  const { login, register: registerAccount } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    api.getCommunities().then((res) => setCommunities(res.communities)).catch(() => {});
  }, []);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const regForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      primaryCommunityId: 'comm-makoko',
    },
  });

  const handleLogin = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  };

  const handleRegister = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      await registerAccount(values);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Registration failed.');
    }
  };

  const handleDemoSignIn = async (email: string) => {
    setServerError(null);
    setBusyEmail(email);
    try {
      await login(email, 'HealthAlert2026!');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center py-8 px-4 sm:px-6">
      <div className="max-w-[960px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Brand & Demo Roles */}
        <div className="lg:col-span-6 bg-[#0B1F3A] text-white rounded-[6px] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-[20px] font-bold tracking-tight">HealthAlert</p>
            <h1 className="mt-5 text-[24px] font-bold leading-snug">
              Community Health Surveillance & Early-Warning Platform
            </h1>
            <p className="mt-2.5 text-[14px] text-[#CBD5E1] leading-relaxed">
              Centralizing resident symptom reports, water source tracking, deterministic pattern detection, and field verification to surface waterborne threats earlier.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/15">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#CBD5E1] mb-3">
              Demonstration Role Access
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={busyEmail !== null}
                  onClick={() => handleDemoSignIn(acc.email)}
                  className="w-full text-left px-3.5 py-2.5 rounded-[6px] bg-white/5 hover:bg-white/10 border border-white/15 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white">{acc.label}</p>
                    <p className="text-[12px] text-[#CBD5E1] truncate">{acc.subtitle}</p>
                  </div>
                  <span className="text-[12px] font-semibold text-[#5EEAD4] whitespace-nowrap shrink-0">
                    {busyEmail === acc.email ? 'Signing in...' : 'Sign in'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sign In / Register Card */}
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-[6px] p-6 sm:p-8 flex flex-col justify-center">
          <div className="inline-flex items-center gap-1 p-1 bg-[#F4F6F8] border border-[#E2E8F0] rounded-[6px] mb-6 w-fit">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setServerError(null);
              }}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-[4px] transition-colors ${
                mode === 'login' ? 'bg-white text-[#0B1F3A] border border-[#E2E8F0]' : 'text-[#4A5B70]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setServerError(null);
              }}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-[4px] transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#0B1F3A] border border-[#E2E8F0]'
                  : 'text-[#4A5B70]'
              }`}
            >
              Resident registration
            </button>
          </div>

          {serverError && (
            <div className="mb-4 p-3 rounded-[6px] bg-[#FEE4E2] border border-[#B42318]/30 text-[13px] text-[#B42318]">
              {serverError}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div>
                <h2 className="text-[20px] font-bold text-[#0B1F3A]">Sign in to HealthAlert</h2>
                <p className="text-[13px] text-[#4A5B70] mt-1">
                  Enter your credentials or select a demonstration role.
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="login-email">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  {...loginForm.register('email')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                  placeholder="you@example.ng"
                />
                {loginForm.formState.errors.email && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  {...loginForm.register('password')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                  placeholder="Enter password"
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loginForm.formState.isSubmitting}
                className="w-full h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px] transition-colors disabled:opacity-60"
              >
                {loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={regForm.handleSubmit(handleRegister)} className="space-y-4">
              <div>
                <h2 className="text-[20px] font-bold text-[#0B1F3A]">Create resident account</h2>
                <p className="text-[13px] text-[#4A5B70] mt-1">
                  New registrations receive resident permissions. Health worker access is assigned by administrators.
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-name">
                  Display name or initials
                </label>
                <input
                  id="reg-name"
                  type="text"
                  {...regForm.register('displayName')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                />
                {regForm.formState.errors.displayName && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {regForm.formState.errors.displayName.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-email">
                  Email address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  {...regForm.register('email')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                />
                {regForm.formState.errors.email && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {regForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-comm">
                  Your community
                </label>
                <select
                  id="reg-comm"
                  {...regForm.register('primaryCommunityId')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] bg-white focus:outline-none focus:border-[#0E7C86]"
                >
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.lga}, {c.state})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-password">
                  Password (min 8 characters)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  {...regForm.register('password')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                />
                {regForm.formState.errors.password && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {regForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={regForm.formState.isSubmitting}
                className="w-full h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px] transition-colors disabled:opacity-60"
              >
                {regForm.formState.isSubmitting ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
