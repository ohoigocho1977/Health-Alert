import type {
  AlertRecord,
  AuditLog,
  Community,
  CommunityDetectionResult,
  FieldVerification,
  HealthReport,
  Intervention,
  Investigation,
  NotificationItem,
  PublicMapReport,
  RiskAssessment,
  ThresholdConfig,
  UserProfile,
} from '../shared/types';

const TOKEN_KEY = 'healthalert_session_token';
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null, persistent = true) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) {
      if (persistent) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.setItem(TOKEN_KEY, token);
      }
    }
  } catch {
    // ignore storage errors
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (
      res.status === 401 &&
      url !== '/api/auth/login' &&
      url !== '/api/auth/register' &&
      url !== '/api/auth/me'
    ) {
      setStoredToken(null);
      unauthorizedHandler?.();
    }
    const errMsg = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

export const api = {
  login: (body: { email: string; password: string; rememberMe?: boolean }) =>
    apiRequest<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  register: (body: {
    email: string;
    password: string;
    displayName: string;
    primaryCommunityId: string;
    requestedRole?: 'resident' | 'health_worker' | 'admin';
    inviteCode?: string;
  }) =>
    apiRequest<{ user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => apiRequest<{ user: UserProfile }>('/api/auth/me'),

  getCommunities: () => apiRequest<{ communities: Community[] }>('/api/communities'),

  createCommunity: (body: {
    name: string;
    state: string;
    lga: string;
    ward: string;
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    populationEstimate: number;
    baselineDailyReports: number;
  }) =>
    apiRequest<{ community: Community }>('/api/communities', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addWaterSource: (communityId: string, body: { name: string; sourceType: string }) =>
    apiRequest<{ waterSource: Community['waterSources'][number]; community: Community }>(
      `/api/communities/${communityId}/water-sources`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  updateWaterSourceStatus: (communityId: string, sourceId: string, status: string) =>
    apiRequest<{ waterSource: Community['waterSources'][number] }>(
      `/api/communities/${communityId}/water-sources/${sourceId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),

  getReports: () => apiRequest<{ reports: HealthReport[] }>('/api/reports'),

  submitReport: (body: {
    communityId: string;
    symptoms: string[];
    severity: string;
    onsetDate: string;
    affectedCount: number;
    ageGroup: string;
    suspectedWaterSourceId?: string;
    notes?: string;
  }) =>
    apiRequest<{ report: HealthReport }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getMapData: () =>
    apiRequest<{
      communities: Community[];
      mapReports: PublicMapReport[];
      detections: CommunityDetectionResult[];
      activeAlerts: AlertRecord[];
    }>('/api/map-data'),

  getVerifications: () => apiRequest<{ verifications: FieldVerification[] }>('/api/verifications'),

  submitVerification: (body: {
    reportId: string;
    outcome: string;
    waterSampleTaken: boolean;
    clinicalNotes: string;
    householdsVisited: number;
  }) =>
    apiRequest<{ verification: FieldVerification; updatedReport: HealthReport }>(
      '/api/verifications',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  getIntelligenceSummary: () =>
    apiRequest<{
      detections: CommunityDetectionResult[];
      thresholdConfig: ThresholdConfig;
      assessments: RiskAssessment[];
      metrics: {
        totalReports: number;
        awaitingVerification: number;
        activeAlertsCount: number;
        verifiedReports: number;
        activeInvestigations: number;
      };
    }>('/api/intelligence/summary'),

  updateThresholds: (body: ThresholdConfig) =>
    apiRequest<{ thresholdConfig: ThresholdConfig }>('/api/intelligence/thresholds', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  runGeminiAnalysis: (communityId: string) =>
    apiRequest<{ assessment: RiskAssessment; detection: CommunityDetectionResult }>(
      '/api/intelligence/analyze',
      {
        method: 'POST',
        body: JSON.stringify({ communityId }),
      }
    ),

  dismissObservation: (communityId: string, note: string) =>
    apiRequest<{ ok: boolean }>('/api/intelligence/dismiss', {
      method: 'POST',
      body: JSON.stringify({ communityId, note }),
    }),

  getAlerts: () => apiRequest<{ alerts: AlertRecord[] }>('/api/alerts'),

  createAlert: (body: {
    communityId: string;
    title: string;
    severity: string;
    classification: string;
    summary: string;
    advisoryMessageForResidents: string;
    linkedAssessmentId?: string;
    linkedReportIds?: string[];
  }) =>
    apiRequest<{ alert: AlertRecord }>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateAlertStatus: (id: string, status: string) =>
    apiRequest<{ alert: AlertRecord }>(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getInvestigations: () =>
    apiRequest<{ investigations: Investigation[]; interventions: Intervention[] }>(
      '/api/investigations'
    ),

  createInvestigation: (body: {
    communityId: string;
    title: string;
    alertId?: string;
    leadWorkerUid?: string;
    priority: string;
    findingsSummary: string;
    linkedReportIds?: string[];
  }) =>
    apiRequest<{ investigation: Investigation }>('/api/investigations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateInvestigation: (id: string, body: { status?: string; findingsSummary?: string }) =>
    apiRequest<{ investigation: Investigation }>(`/api/investigations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  createIntervention: (body: {
    investigationId: string;
    actionType: string;
    description: string;
    householdsReached: number;
    status: string;
  }) =>
    apiRequest<{ intervention: Intervention }>('/api/interventions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getNotifications: () => apiRequest<{ notifications: NotificationItem[] }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  getAdminUsers: () => apiRequest<{ users: UserProfile[] }>('/api/admin/users'),

  createAdminUser: (body: {
    email: string;
    password: string;
    displayName: string;
    role: 'resident' | 'health_worker' | 'admin';
    assignedCommunityIds: string[];
  }) =>
    apiRequest<{ user: UserProfile }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateAdminUser: (
    id: string,
    body: { role?: string; assignedCommunityIds?: string[]; active?: boolean }
  ) =>
    apiRequest<{ user: UserProfile }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  getAuditLogs: () => apiRequest<{ auditLogs: AuditLog[] }>('/api/admin/audit-logs'),

  resetDemo: () => apiRequest<{ ok: boolean }>('/api/admin/reset-demo', { method: 'POST' }),
};
