import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGlobalFilter } from '../context/FilterContext';
import { api } from '../lib/api';
import type { Community, UserRole } from '../shared/types';

interface NavItem {
  to: string;
  label: string;
}

function getNavForRole(role: UserRole): NavItem[] {
  if (role === 'admin') {
    return [
      { to: '/admin', label: 'Overview' },
      { to: '/reports', label: 'Health Reports' },
      { to: '/intelligence', label: 'Risk Intelligence' },
      { to: '/map', label: 'Community Risk Map' },
      { to: '/alerts', label: 'Alerts' },
      { to: '/investigations', label: 'Investigations' },
      { to: '/communities', label: 'Communities' },
      { to: '/users', label: 'Users' },
      { to: '/settings', label: 'Settings' },
    ];
  }
  if (role === 'health_worker') {
    return [
      { to: '/worker', label: 'Today' },
      { to: '/reports', label: 'Health Reports' },
      { to: '/intelligence', label: 'Risk Intelligence' },
      { to: '/map', label: 'Community Risk Map' },
      { to: '/alerts', label: 'Alerts' },
      { to: '/investigations', label: 'Investigations' },
      { to: '/settings', label: 'Settings' },
    ];
  }
  return [
    { to: '/resident', label: 'Report a problem' },
    { to: '/reports', label: 'My Reports' },
    { to: '/map', label: 'Community Risk Map' },
    { to: '/alerts', label: 'Advisories' },
    { to: '/settings', label: 'Settings' },
  ];
}

function shortUserName(displayName: string): string {
  const clean = displayName.split('(')[0].trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  }
  return clean;
}

export function Layout({
  title,
  subtitle,
  showDemoBadge = true,
  headerActions,
  hideDesktopHeader = false,
  children,
}: {
  title: string;
  subtitle?: string;
  showDemoBadge?: boolean;
  headerActions?: React.ReactNode;
  hideDesktopHeader?: boolean;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const { searchQuery, setSearchQuery, selectedCommunityId, setSelectedCommunityId } =
    useGlobalFilter();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    api
      .getCommunities()
      .then((res) => setCommunities(res.communities))
      .catch(() => {});
    api
      .getAlerts()
      .then((res) => setActiveAlertCount(res.alerts.filter((a) => a.status !== 'resolved').length))
      .catch(() => {});
  }, [user, location.pathname]);

  if (!user) return <>{children}</>;

  const navItems = getNavForRole(user.role);
  const homePath =
    user.role === 'admin' ? '/admin' : user.role === 'health_worker' ? '/worker' : '/resident';

  const handleSignOut = async () => {
    setMobileNavOpen(false);
    setUserMenuOpen(false);
    setSearchQuery('');
    setSelectedCommunityId('');
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-white select-none">
      <div className="px-5 pt-5 pb-4">
        <Link
          to={homePath}
          onClick={() => setMobileNavOpen(false)}
          className="text-[18px] font-bold tracking-tight text-white block whitespace-nowrap"
        >
          HealthAlert
        </Link>
      </div>

      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto" aria-label="Primary navigation">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileNavOpen(false)}
              className={`block px-3 py-2 rounded-[6px] text-[13px] font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#0E7C86] text-white'
                  : 'text-[#CBD5E1] hover:text-white hover:bg-white/5'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 text-[12px]">
        <p className="font-medium text-white truncate">{user.displayName}</p>
        <p className="text-[#94A3B8] truncate capitalize mt-0.5">
          {user.role.replace('_', ' ')}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-3 w-full py-1.5 px-3 text-left text-[12px] font-medium text-[#CBD5E1] hover:text-white hover:bg-white/10 rounded-[6px] transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F6F8] text-[#0B1F3A]">
      {/* Desktop Navy Sidebar */}
      <aside className="hidden lg:block w-[220px] shrink-0 sticky top-0 h-screen">{sidebar}</aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0B1F3A]/45"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-[240px] max-w-[82vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-3 p-2 text-slate-300 hover:text-white rounded-[6px]"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top White Utility Bar */}
        <header className="bg-white border-b border-[#E2E8F0] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-1.5 text-[#0B1F3A] hover:bg-[#F4F6F8] rounded-[6px] min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports, communities, alerts"
              aria-label="Search reports, communities, alerts"
              className="w-full max-w-[480px] h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] text-[#0B1F3A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0E7C86]"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Filter community"
              value={selectedCommunityId}
              onChange={(e) => setSelectedCommunityId(e.target.value)}
              className="hidden sm:block h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A] focus:outline-none focus:border-[#0E7C86]"
            >
              <option value="">All Communities</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <Link
              to="/alerts"
              className="h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A] hover:bg-[#F4F6F8] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Alerts</span>
              <span
                className={`tabular-nums font-semibold ${
                  activeAlertCount > 0 ? 'text-[#B42318]' : 'text-[#4A5B70]'
                }`}
              >
                {activeAlertCount}
              </span>
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="h-9 px-3 bg-white border border-[#E2E8F0] rounded-[6px] text-[13px] font-medium text-[#0B1F3A] hover:bg-[#F4F6F8] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span className="truncate max-w-[110px]">{shortUserName(user.displayName)}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#4A5B70]" />
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-48 bg-white border border-[#E2E8F0] rounded-[6px] py-1 z-30 shadow-sm"
                  onMouseLeave={() => setUserMenuOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-[#E2E8F0]">
                    <p className="text-[12px] font-semibold text-[#0B1F3A] truncate">
                      {user.displayName}
                    </p>
                    <p className="text-[11px] text-[#4A5B70] truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-[#0B1F3A] hover:bg-[#F4F6F8]"
                  >
                    Settings & Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 text-[13px] text-[#B42318] hover:bg-[#FEE4E2]/40"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1360px] w-full mx-auto">
          {!hideDesktopHeader && (
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <h1 className="text-[22px] font-bold text-[#0B1F3A] tracking-tight leading-tight">
                  {title}
                </h1>
                {subtitle && <p className="text-[13px] text-[#4A5B70] mt-1">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-2.5">
                {headerActions}
                {showDemoBadge && (
                  <span className="px-2.5 py-1 bg-[#E2E8F0]/80 text-[#4A5B70] text-[12px] font-medium rounded-[4px] whitespace-nowrap">
                    Demonstration data
                  </span>
                )}
              </div>
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
