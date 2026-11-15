import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { AuthPage } from './pages/AuthPage';
import { ResidentPortal } from './pages/ResidentPortal';
import { WorkerPortal } from './pages/WorkerPortal';
import { AdminDashboard } from './pages/AdminDashboard';
import { RiskIntelligencePage } from './pages/RiskIntelligencePage';
import { HealthReportsPage } from './pages/HealthReportsPage';
import { AlertsPage } from './pages/AlertsPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { CommunitiesPage } from './pages/CommunitiesPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { MapPage } from './pages/MapPage';
import type { UserRole } from './shared/types';

function defaultHomeForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'health_worker':
      return '/worker';
    default:
      return '/resident';
  }
}

function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex items-center justify-center text-[14px] text-[#4A5B70]">
        Loading HealthAlert session...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={defaultHomeForRole(user.role)} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex items-center justify-center text-[14px] text-[#4A5B70]">
        Initializing HealthAlert...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={defaultHomeForRole(user.role)} replace /> : <AuthPage />}
      />
      <Route
        path="/resident"
        element={
          <RoleGuard allowedRoles={['resident', 'health_worker', 'admin']}>
            <ResidentPortal />
          </RoleGuard>
        }
      />
      <Route
        path="/worker"
        element={
          <RoleGuard allowedRoles={['health_worker', 'admin']}>
            <WorkerPortal />
          </RoleGuard>
        }
      />
      <Route
        path="/admin"
        element={
          <RoleGuard allowedRoles={['admin', 'health_worker']}>
            <AdminDashboard />
          </RoleGuard>
        }
      />
      <Route
        path="/reports"
        element={
          <RoleGuard allowedRoles={['resident', 'health_worker', 'admin']}>
            <HealthReportsPage />
          </RoleGuard>
        }
      />
      <Route
        path="/intelligence"
        element={
          <RoleGuard allowedRoles={['health_worker', 'admin']}>
            <RiskIntelligencePage />
          </RoleGuard>
        }
      />
      <Route
        path="/map"
        element={
          <RoleGuard allowedRoles={['resident', 'health_worker', 'admin']}>
            <MapPage />
          </RoleGuard>
        }
      />
      <Route
        path="/alerts"
        element={
          <RoleGuard allowedRoles={['resident', 'health_worker', 'admin']}>
            <AlertsPage />
          </RoleGuard>
        }
      />
      <Route
        path="/investigations"
        element={
          <RoleGuard allowedRoles={['health_worker', 'admin']}>
            <InvestigationsPage />
          </RoleGuard>
        }
      />
      <Route
        path="/communities"
        element={
          <RoleGuard allowedRoles={['admin']}>
            <CommunitiesPage />
          </RoleGuard>
        }
      />
      <Route
        path="/users"
        element={
          <RoleGuard allowedRoles={['admin']}>
            <UsersPage />
          </RoleGuard>
        }
      />
      <Route
        path="/settings"
        element={
          <RoleGuard allowedRoles={['resident', 'health_worker', 'admin']}>
            <SettingsPage />
          </RoleGuard>
        }
      />
      <Route
        path="/manage"
        element={<Navigate to="/communities" replace />}
      />
      <Route
        path="*"
        element={<Navigate to={user ? defaultHomeForRole(user.role) : '/login'} replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FilterProvider>
          <AppRoutes />
        </FilterProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
