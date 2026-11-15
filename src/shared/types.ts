import { z } from 'zod';

export type UserRole = 'resident' | 'health_worker' | 'admin';

export type SymptomKey =
  | 'watery_diarrhoea'
  | 'bloody_diarrhoea'
  | 'vomiting'
  | 'abdominal_cramps'
  | 'fever'
  | 'dehydration_signs'
  | 'nausea';

export const SYMPTOM_LABELS: Record<SymptomKey, string> = {
  watery_diarrhoea: 'Watery Diarrhoea',
  bloody_diarrhoea: 'Bloody Diarrhoea',
  vomiting: 'Vomiting',
  abdominal_cramps: 'Stomach / Abdominal Cramps',
  fever: 'Fever / Chills',
  dehydration_signs: 'Dry Mouth / Extreme Thirst',
  nausea: 'Nausea / Loss of Appetite',
};

export type SeverityLevel = 'mild' | 'moderate' | 'severe';
export type VerificationStatus = 'pending' | 'under_review' | 'verified' | 'unconfirmed' | 'resolved';
export type AlertSeverity = 'advisory' | 'watch' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type InvestigationStatus = 'open' | 'field_dispatch' | 'sampling' | 'contained' | 'closed';
export type InvestigationPriority = 'routine' | 'elevated' | 'urgent';

export type SurveillanceClassification =
  | 'individual_reports_only'
  | 'unusual_reporting_activity'
  | 'potential_health_threat'
  | 'human_verified_incident'
  | 'officially_confirmed_outbreak';

export const CLASSIFICATION_LABELS: Record<SurveillanceClassification, string> = {
  individual_reports_only: 'Baseline Individual Reports',
  unusual_reporting_activity: 'Unusual Reporting Activity',
  potential_health_threat: 'Potential Health Threat',
  human_verified_incident: 'Human-Verified Incident',
  officially_confirmed_outbreak: 'Officially Confirmed Outbreak',
};

export interface WaterSource {
  id: string;
  name: string;
  sourceType: 'borehole' | 'shallow_well' | 'river_stream' | 'sachet_vendor' | 'municipal_tap';
  lat: number;
  lng: number;
  status: 'operational' | 'suspected' | 'tested_contaminated' | 'closed_treated';
}

export interface Community {
  id: string;
  name: string;
  state: string;
  lga: string;
  ward: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  populationEstimate: number;
  baselineDailyReports: number;
  waterSources: WaterSource[];
  active: boolean;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  assignedCommunityIds: string[];
  primaryCommunityId?: string;
  active: boolean;
  createdAt: string;
}

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

export interface HealthReport {
  id: string;
  reporterUid: string;
  communityId: string;
  communityName: string;
  symptoms: SymptomKey[];
  severity: SeverityLevel;
  onsetDate: string;
  affectedCount: number;
  ageGroup: 'under_5' | '5_17' | '18_59' | '60_plus' | 'mixed_household';
  suspectedWaterSourceId?: string;
  suspectedWaterSourceLabel?: string;
  notes: string;
  approxLat: number;
  approxLng: number;
  verificationStatus: VerificationStatus;
  isSimulated: boolean;
  scenarioTag?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMapReport {
  id: string;
  communityId: string;
  communityName: string;
  symptoms: SymptomKey[];
  severity: SeverityLevel;
  affectedCount: number;
  suspectedWaterSourceId?: string;
  suspectedWaterSourceLabel?: string;
  approxLat: number;
  approxLng: number;
  verificationStatus: VerificationStatus;
  isSimulated: boolean;
  createdAt: string;
}

export interface FieldVerification {
  id: string;
  reportId: string;
  communityId: string;
  workerUid: string;
  workerName: string;
  outcome: 'confirmed_cluster' | 'isolated_case' | 'false_report' | 'requires_lab_test';
  waterSampleTaken: boolean;
  clinicalNotes: string;
  householdsVisited: number;
  createdAt: string;
}

export interface ThresholdConfig {
  windowHours: number;
  baselineDays: number;
  volumeMultiplierThreshold: number;
  zScoreThreshold: number;
  clusterRadiusMeters: number;
  clusterMinReports: number;
  waterSourceConcentrationThreshold: number;
  minReportsForAnomaly: number;
}

export const DEFAULT_THRESHOLD_CONFIG: ThresholdConfig = {
  windowHours: 48,
  baselineDays: 14,
  volumeMultiplierThreshold: 2.0,
  zScoreThreshold: 1.8,
  clusterRadiusMeters: 850,
  clusterMinReports: 3,
  waterSourceConcentrationThreshold: 3,
  minReportsForAnomaly: 3,
};

export interface StatisticalSignal {
  signalType:
    | 'volume_surge'
    | 'z_score_spike'
    | 'spatial_cluster'
    | 'water_source_convergence'
    | 'severity_escalation'
    | 'cross_community_divergence';
  label: string;
  metricValue: number;
  thresholdValue: number;
  unit: string;
  description: string;
  relatedReportIds: string[];
  clusterCenter?: { lat: number; lng: number };
  suspectedWaterSourceId?: string;
  suspectedWaterSourceLabel?: string;
}

export interface CommunityDetectionResult {
  communityId: string;
  communityName: string;
  recentReportCount: number;
  recentAffectedPeople: number;
  baselineDailyMean: number;
  currentDailyRate: number;
  volumeMultiplier: number;
  zScore: number;
  peerMedianDailyRate: number;
  verifiedCount: number;
  pendingCount: number;
  signals: StatisticalSignal[];
  suggestedClassification: SurveillanceClassification;
  traceableReportIds: string[];
  dailySeries: Array<{ date: string; reports: number; baseline: number; affected: number }>;
  limitations: string[];
}

export interface RiskAssessment {
  id: string;
  communityId: string;
  communityName: string;
  generatedBy: 'statistical_engine' | 'gemini_ai';
  statusClassification: SurveillanceClassification;
  statisticalSignals: StatisticalSignal[];
  thresholdConfigSnapshot: ThresholdConfig;
  aiSummary?: string;
  patternExplanation?: string;
  riskLevel?: 'low' | 'elevated' | 'high';
  recommendedPriorities?: string[];
  uncertaintyStatement?: string;
  limitations: string[];
  traceableReportIds: string[];
  createdByUid: string;
  createdAt: string;
}

export interface AlertRecord {
  id: string;
  communityId: string;
  communityName: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  classification: SurveillanceClassification;
  summary: string;
  advisoryMessageForResidents: string;
  linkedAssessmentId?: string;
  linkedReportIds: string[];
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface Investigation {
  id: string;
  communityId: string;
  communityName: string;
  title: string;
  alertId?: string;
  leadWorkerUid?: string;
  leadWorkerName?: string;
  status: InvestigationStatus;
  priority: InvestigationPriority;
  findingsSummary: string;
  linkedReportIds: string[];
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface Intervention {
  id: string;
  investigationId: string;
  communityId: string;
  actionType:
    | 'water_chlorination'
    | 'boil_water_advisory'
    | 'ors_distribution'
    | 'source_closure'
    | 'hygiene_sensitization'
    | 'sample_lab_referral';
  description: string;
  householdsReached: number;
  status: 'planned' | 'in_progress' | 'completed';
  recordedByUid: string;
  recordedByName: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  targetRole: 'all' | UserRole;
  targetCommunityId?: string;
  title: string;
  message: string;
  severity: 'info' | 'advisory' | 'warning';
  readByUids: string[];
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorRole: UserRole;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

// Zod validation schemas (used across both frontend forms and backend API routes)
export const registerSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(120),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must include at least one letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
  displayName: z.string().trim().min(2, 'Enter a display name (min 2 characters)').max(80),
  primaryCommunityId: z.string().min(1, 'Select your community').max(64),
  requestedRole: z.enum(['resident', 'health_worker', 'admin']).optional().default('resident'),
  inviteCode: z.string().trim().max(128).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(true),
});

export const adminCreateUserSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(120),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must include at least one letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
  displayName: z.string().trim().min(2, 'Enter a display name (min 2 characters)').max(80),
  role: z.enum(['resident', 'health_worker', 'admin']),
  assignedCommunityIds: z.array(z.string().min(1).max(64)).min(1, 'Assign at least one community'),
});

export const symptomReportSchema = z.object({
  communityId: z.string().min(1, 'Please select your community').max(64),
  symptoms: z
    .array(
      z.enum([
        'watery_diarrhoea',
        'bloody_diarrhoea',
        'vomiting',
        'abdominal_cramps',
        'fever',
        'dehydration_signs',
        'nausea',
      ])
    )
    .min(1, 'Select at least one symptom')
    .max(7),
  severity: z.enum(['mild', 'moderate', 'severe']),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid onset date (YYYY-MM-DD)')
    .refine((val) => {
      const parsed = Date.parse(`${val}T00:00:00Z`);
      // Allow +1 day buffer for client/server timezone differences
      return !Number.isNaN(parsed) && parsed <= Date.now() + 36 * 3600 * 1000;
    }, 'Onset date cannot be in the future'),
  affectedCount: z.number().int().min(1).max(50),
  ageGroup: z.enum(['under_5', '5_17', '18_59', '60_plus', 'mixed_household']),
  suspectedWaterSourceId: z.string().max(64).optional(),
  notes: z.string().trim().max(600, 'Notes must be under 600 characters'),
});

export const observationDismissSchema = z.object({
  communityId: z.string().min(1).max(64),
  note: z.string().trim().min(5, 'Enter a brief rationale note (min 5 chars)').max(500),
});

export const fieldVerificationSchema = z.object({
  reportId: z.string().min(1).max(64),
  outcome: z.enum(['confirmed_cluster', 'isolated_case', 'false_report', 'requires_lab_test']),
  waterSampleTaken: z.boolean(),
  clinicalNotes: z.string().trim().min(10, 'Provide brief field observation notes (min 10 chars)').max(1000),
  householdsVisited: z.number().int().min(1).max(200),
});

export const alertCreateSchema = z.object({
  communityId: z.string().min(1).max(64),
  title: z.string().trim().min(5).max(140),
  severity: z.enum(['advisory', 'watch', 'warning', 'critical']),
  classification: z.enum([
    'individual_reports_only',
    'unusual_reporting_activity',
    'potential_health_threat',
    'human_verified_incident',
    'officially_confirmed_outbreak',
  ]),
  summary: z.string().trim().min(10).max(1000),
  advisoryMessageForResidents: z.string().trim().min(10).max(600),
  linkedAssessmentId: z.string().max(64).optional(),
  linkedReportIds: z.array(z.string().max(64)).max(100),
});

export const investigationCreateSchema = z.object({
  communityId: z.string().min(1).max(64),
  title: z.string().trim().min(5).max(140),
  alertId: z.string().max(64).optional(),
  leadWorkerUid: z.string().max(64).optional(),
  priority: z.enum(['routine', 'elevated', 'urgent']),
  findingsSummary: z.string().trim().min(5).max(1000),
  linkedReportIds: z.array(z.string().max(64)).max(100),
});

export const interventionCreateSchema = z.object({
  investigationId: z.string().min(1).max(64),
  actionType: z.enum([
    'water_chlorination',
    'boil_water_advisory',
    'ors_distribution',
    'source_closure',
    'hygiene_sensitization',
    'sample_lab_referral',
  ]),
  description: z.string().trim().min(8).max(600),
  householdsReached: z.number().int().min(0).max(10000),
  status: z.enum(['planned', 'in_progress', 'completed']),
});

export const thresholdConfigSchema = z.object({
  windowHours: z.number().int().min(12).max(168),
  baselineDays: z.number().int().min(7).max(60),
  volumeMultiplierThreshold: z.number().min(1.2).max(10),
  zScoreThreshold: z.number().min(1.0).max(5.0),
  clusterRadiusMeters: z.number().int().min(200).max(5000),
  clusterMinReports: z.number().int().min(2).max(25),
  waterSourceConcentrationThreshold: z.number().int().min(2).max(25),
  minReportsForAnomaly: z.number().int().min(2).max(25),
});

export const communityCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(60),
  lga: z.string().trim().min(2).max(80),
  ward: z.string().trim().min(2).max(80),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.5).max(50),
  populationEstimate: z.number().int().min(100).max(5000000),
  baselineDailyReports: z.number().min(0.1).max(500),
});
