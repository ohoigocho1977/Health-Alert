import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  loginSchema,
  registerSchema,
  type Community,
  type UserRole,
} from '../shared/types';
import { z } from 'zod';

const loginFormSchema = loginSchema;
const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type LoginFormValues = z.input<typeof loginFormSchema>;
type RegisterFormValues = z.input<typeof registerFormSchema>;

const ROLE_DESCRIPTIONS: Array<{ role: string; scope: string }> = [
  {
    role: 'Community Resident',
    scope: 'Submit symptom reports, track report status, and read local advisories.',
  },
  {
    role: 'Community Health Worker',
    scope: 'Verify incoming reports, update water points, and log field interventions.',
  },
  {
    role: 'Health Administrator',
    scope: 'Monitor community trends, run AI intelligence, issue alerts, and manage access.',
  },
];

function homeRouteForRole(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'health_worker') return '/worker';
  return '/resident';
}

export function AuthPage({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const { login, register: registerAccount } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setServerError(null);
  }, [initialMode]);

  useEffect(() => {
    api
      .getCommunities()
      .then((res) => {
        setCommunities(res.communities);
        setCommunitiesError(null);
      })
      .catch(() => {
        setCommunitiesError('Unable to load communities list. Refresh to retry.');
      });
  }, []);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  const regForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      primaryCommunityId: 'comm-makoko',
      requestedRole: 'resident',
      inviteCode: '',
    },
  });

  const selectedRole = regForm.watch('requestedRole') || 'resident';

  useEffect(() => {
    if (communities.length > 0) {
      const current = regForm.getValues('primaryCommunityId');
      if (!communities.some((c) => c.id === current)) {
        regForm.setValue('primaryCommunityId', communities[0].id);
      }
    }
  }, [communities, regForm]);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setServerError(null);
    loginForm.clearErrors();
    regForm.clearErrors();
    navigate(nextMode === 'register' ? '/register' : '/login', { replace: true });
  };

  const handleLogin = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const signedInUser = await login(
        values.email,
        values.password,
        values.rememberMe ?? true
      );
      navigate(homeRouteForRole(signedInUser.role), { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign-in failed. Check your credentials.');
    }
  };

  const handleRegister = async (values: RegisterFormValues) => {
    setServerError(null);
    if (
      (values.requestedRole === 'health_worker' || values.requestedRole === 'admin') &&
      (!values.inviteCode || values.inviteCode.trim().length === 0)
    ) {
      regForm.setError('inviteCode', {
        type: 'manual',
        message: 'Authorization code is required for this role',
      });
      return;
    }

    try {
      const createdUser = await registerAccount({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        primaryCommunityId: values.primaryCommunityId,
        requestedRole: values.requestedRole,
        inviteCode: values.inviteCode?.trim() || undefined,
      });
      navigate(homeRouteForRole(createdUser.role), { replace: true });
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Registration failed. Please verify your details.'
      );
    }
  };

  const isBusy = loginForm.formState.isSubmitting || regForm.formState.isSubmitting;

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center py-8 px-4 sm:px-6">
      <div className="max-w-[960px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Brand & Role Overview */}
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
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-[#5EEAD4] shrink-0" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#CBD5E1]">
                Role-Based Access Control
              </p>
            </div>
            <div className="space-y-2.5">
              {ROLE_DESCRIPTIONS.map((item) => (
                <div
                  key={item.role}
                  className="px-3.5 py-2.5 rounded-[6px] bg-white/5 border border-white/15"
                >
                  <p className="text-[13px] font-semibold text-white">{item.role}</p>
                  <p className="text-[12px] text-[#CBD5E1] mt-0.5 leading-snug">{item.scope}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sign In / Register Card */}
        <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-[6px] p-6 sm:p-8 flex flex-col justify-center">
          <div className="inline-flex items-center gap-1 p-1 bg-[#F4F6F8] border border-[#E2E8F0] rounded-[6px] mb-6 w-fit">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => switchMode('login')}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-[4px] transition-colors ${
                mode === 'login' ? 'bg-white text-[#0B1F3A] border border-[#E2E8F0]' : 'text-[#4A5B70]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => switchMode('register')}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-[4px] transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#0B1F3A] border border-[#E2E8F0]'
                  : 'text-[#4A5B70]'
              }`}
            >
              Create account
            </button>
          </div>

          {serverError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-[6px] bg-[#FEE4E2] border border-[#B42318]/30 text-[13px] text-[#B42318]"
            >
              {serverError}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} noValidate className="space-y-4">
              <div>
                <h2 className="text-[20px] font-bold text-[#0B1F3A]">Sign in to HealthAlert</h2>
                <p className="text-[13px] text-[#4A5B70] mt-1">
                  Enter your registered email and password to open your role dashboard.
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
                  disabled={loginForm.formState.isSubmitting}
                  {...loginForm.register('email')}
                  className="w-full h-11 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86] disabled:bg-[#F4F6F8]"
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
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    disabled={loginForm.formState.isSubmitting}
                    {...loginForm.register('password')}
                    className="w-full h-11 pl-3.5 pr-11 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86] disabled:bg-[#F4F6F8]"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-[#4A5B70] hover:text-[#0B1F3A] rounded-[4px]"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[#4A5B70] cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={loginForm.formState.isSubmitting}
                  {...loginForm.register('rememberMe')}
                  className="w-4 h-4 rounded border-[#CBD5E1] text-[#0E7C86] focus:ring-[#0E7C86]"
                />
                <span>Keep me signed in on this device</span>
              </label>

              <button
                type="submit"
                disabled={loginForm.formState.isSubmitting}
                className="w-full h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {loginForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign in'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={regForm.handleSubmit(handleRegister)} noValidate className="space-y-3.5">
              <div>
                <h2 className="text-[20px] font-bold text-[#0B1F3A]">Create an account</h2>
                <p className="text-[13px] text-[#4A5B70] mt-1">
                  Residents can register directly. Health workers and administrators require a server authorization code.
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-name">
                  Full name or initials
                </label>
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  disabled={regForm.formState.isSubmitting}
                  {...regForm.register('displayName')}
                  className="w-full h-10 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86] disabled:bg-[#F4F6F8]"
                  placeholder="e.g. Amina Yusuf"
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
                  autoComplete="email"
                  disabled={regForm.formState.isSubmitting}
                  {...regForm.register('email')}
                  className="w-full h-10 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86] disabled:bg-[#F4F6F8]"
                  placeholder="you@example.ng"
                />
                {regForm.formState.errors.email && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {regForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-role">
                    Account role
                  </label>
                  <select
                    id="reg-role"
                    disabled={regForm.formState.isSubmitting}
                    {...regForm.register('requestedRole')}
                    className="w-full h-10 px-3 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white focus:outline-none focus:border-[#0E7C86]"
                  >
                    <option value="resident">Community Resident</option>
                    <option value="health_worker">Community Health Worker</option>
                    <option value="admin">Health Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-comm">
                    Primary community
                  </label>
                  <select
                    id="reg-comm"
                    disabled={regForm.formState.isSubmitting || communities.length === 0}
                    {...regForm.register('primaryCommunityId')}
                    className="w-full h-10 px-3 text-[13px] border border-[#CBD5E1] rounded-[6px] bg-white focus:outline-none focus:border-[#0E7C86]"
                  >
                    {communities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.lga})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {communitiesError && (
                <p className="text-[12px] text-[#B42318]">{communitiesError}</p>
              )}

              {(selectedRole === 'health_worker' || selectedRole === 'admin') && (
                <div>
                  <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-invite">
                    {selectedRole === 'admin'
                      ? 'Administrator authorization code'
                      : 'Health worker authorization code'}
                  </label>
                  <input
                    id="reg-invite"
                    type="password"
                    autoComplete="off"
                    disabled={regForm.formState.isSubmitting}
                    {...regForm.register('inviteCode')}
                    className="w-full h-10 px-3.5 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86]"
                    placeholder="Enter server-issued authorization code"
                  />
                  {regForm.formState.errors.inviteCode && (
                    <p className="mt-1 text-[12px] text-[#B42318]">
                      {regForm.formState.errors.inviteCode.message}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-password">
                  Password (8+ chars, letters & numbers)
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showRegPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    disabled={regForm.formState.isSubmitting}
                    {...regForm.register('password')}
                    className="w-full h-10 pl-3.5 pr-11 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86] disabled:bg-[#F4F6F8]"
                    placeholder="Create a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword((prev) => !prev)}
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-[#4A5B70] hover:text-[#0B1F3A] rounded-[4px]"
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {regForm.formState.errors.password && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {regForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B1F3A] mb-1" htmlFor="reg-confirm">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="reg-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    disabled={regForm.formState.isSubmitting}
                    {...regForm.register('confirmPassword')}
                    className="w-full h-10 pl-3.5 pr-11 text-[14px] border border-[#CBD5E1] rounded-[6px] focus:outline-none focus:border-[#0E7C86] disabled:bg-[#F4F6F8]"
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-[#4A5B70] hover:text-[#0B1F3A] rounded-[4px]"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {regForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-[12px] text-[#B42318]">
                    {regForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={regForm.formState.isSubmitting}
                className="w-full h-11 bg-[#0E7C86] hover:bg-[#0B666E] text-white text-[14px] font-semibold rounded-[6px] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {regForm.formState.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{regForm.formState.isSubmitting ? 'Creating account...' : 'Create account'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
