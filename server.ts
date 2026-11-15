import 'dotenv/config';
import express, { type NextFunction, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  alertCreateSchema,
  communityCreateSchema,
  fieldVerificationSchema,
  interventionCreateSchema,
  investigationCreateSchema,
  loginSchema,
  observationDismissSchema,
  registerSchema,
  symptomReportSchema,
  thresholdConfigSchema,
  type AlertRecord,
  type FieldVerification,
  type HealthReport,
  type Intervention,
  type Investigation,
  type NotificationItem,
  type PublicMapReport,
  type UserRole,
} from './src/shared/types.ts';
import {
  canAccessCommunity,
  extractTokenFromRequest,
  hashPassword,
  requireRole,
  sanitizeUser,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type AuthenticatedRequest,
} from './server/auth.ts';
import { runDetectionAcrossCommunities, runStatisticalDetectionForCommunity } from './server/detectionEngine.ts';
import { generateCommunityRiskAssessment } from './server/geminiService.ts';
import {
  computePrivacyFuzzedCoordinates,
  loadDatabase,
  recordAuditLog,
  resetDemoDatabase,
  saveDatabase,
} from './server/store.ts';

function stripHtml(value: string): string {
  return value.replace(/[<>]/g, '').trim();
}

function isHttpsRequest(req: AuthenticatedRequest): boolean {
  const proto = req.headers['x-forwarded-proto'];
  return req.secure || proto === 'https' || (Array.isArray(proto) && proto.includes('https'));
}

function setSessionCookie(req: AuthenticatedRequest, res: Response, token: string) {
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `ha_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Max-Age=${60 * 60 * 24 * 7}`
  );
}

function clearSessionCookie(req: AuthenticatedRequest, res: Response) {
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ha_session=; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Max-Age=0`);
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'unknown'}:${req.authUser?.id || 'anon'}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 2000) {
      for (const [k, timestamps] of hits.entries()) {
        if (timestamps.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    next();
  };
}

const authRateLimit = createRateLimiter(30, 15 * 60 * 1000);
const aiRateLimit = createRateLimiter(20, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Attach authenticated user from cookie or Bearer token
  app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const token = extractTokenFromRequest(req);
    if (token) {
      const payload = verifySessionToken(token);
      if (payload) {
        const db = loadDatabase();
        const found = db.users.find((u) => u.id === payload.uid);
        if (found) {
          req.authUser = sanitizeUser(found);
        }
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'healthalert-api', timestamp: new Date().toISOString() });
  });

  // ---------------------------------------------------------------------------
  // Authentication & Registration
  // ---------------------------------------------------------------------------
  app.post('/api/auth/register', authRateLimit, (req: AuthenticatedRequest, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data.' });
      return;
    }

    const db = loadDatabase();
    const normalizedEmail = parsed.data.email.toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const community = db.communities.find((c) => c.id === parsed.data.primaryCommunityId && c.active);
    if (!community) {
      res.status(400).json({ error: 'Selected community does not exist.' });
      return;
    }

    const now = new Date().toISOString();
    // Self-registration is strictly restricted to 'resident' role to prevent privilege escalation
    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: normalizedEmail,
      passwordHash: hashPassword(parsed.data.password),
      displayName: stripHtml(parsed.data.displayName),
      role: 'resident' as UserRole,
      assignedCommunityIds: [community.id],
      primaryCommunityId: community.id,
      active: true,
      createdAt: now,
    };

    db.users.push(newUser);
    recordAuditLog(db, {
      actorUid: newUser.id,
      actorRole: newUser.role,
      actorEmail: newUser.email,
      action: 'REGISTER_RESIDENT',
      entityType: 'users',
      entityId: newUser.id,
      details: `Registered resident account for community ${community.name}.`,
    });
    saveDatabase(db);

    const token = signSessionToken(newUser.id, newUser.role);
    setSessionCookie(req, res, token);
    res.status(201).json({ user: sanitizeUser(newUser), token });
  });

  app.post('/api/auth/login', authRateLimit, (req: AuthenticatedRequest, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid login credentials.' });
      return;
    }

    const db = loadDatabase();
    const normalizedEmail = parsed.data.email.toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      recordAuditLog(db, {
        actorUid: user?.id || 'anonymous',
        actorRole: user?.role || 'resident',
        actorEmail: stripHtml(normalizedEmail).slice(0, 120),
        action: 'LOGIN_FAILED',
        entityType: 'auth',
        entityId: user?.id || 'unknown',
        details: 'Failed sign-in attempt.',
      });
      saveDatabase(db);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
      return;
    }

    const token = signSessionToken(user.id, user.role);
    setSessionCookie(req, res, token);
    res.json({ user: sanitizeUser(user), token });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    res.json({ user: req.authUser });
  });

  // ---------------------------------------------------------------------------
  // Communities & Water Sources
  // ---------------------------------------------------------------------------
  app.get('/api/communities', (_req, res) => {
    const db = loadDatabase();
    res.json({ communities: db.communities });
  });

  app.post('/api/communities', requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const parsed = communityCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid community input.' });
      return;
    }

    const db = loadDatabase();
    const newCommunity = {
      id: `comm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: stripHtml(parsed.data.name),
      state: stripHtml(parsed.data.state),
      lga: stripHtml(parsed.data.lga),
      ward: stripHtml(parsed.data.ward),
      centerLat: parsed.data.centerLat,
      centerLng: parsed.data.centerLng,
      radiusKm: parsed.data.radiusKm,
      populationEstimate: parsed.data.populationEstimate,
      baselineDailyReports: parsed.data.baselineDailyReports,
      waterSources: [],
      active: true,
      createdAt: new Date().toISOString(),
    };

    db.communities.push(newCommunity);
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'CREATE_COMMUNITY',
      entityType: 'communities',
      entityId: newCommunity.id,
      details: `Added community ${newCommunity.name} (${newCommunity.lga}, ${newCommunity.state}).`,
    });
    saveDatabase(db);

    res.status(201).json({ community: newCommunity });
  });

  app.post('/api/communities/:id/water-sources', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === req.params.id);
    if (!community) {
      res.status(404).json({ error: 'Community not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, community.id)) {
      res.status(403).json({ error: 'Not authorized for this community.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? stripHtml(req.body.name) : '';
    const sourceType = req.body?.sourceType;
    const allowedTypes = ['borehole', 'shallow_well', 'river_stream', 'sachet_vendor', 'municipal_tap'];
    if (name.length < 2 || !allowedTypes.includes(sourceType)) {
      res.status(400).json({ error: 'Provide a valid water source name and type.' });
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const ws = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      sourceType,
      lat: Number((community.centerLat + 0.002 * Math.cos(angle)).toFixed(5)),
      lng: Number((community.centerLng + 0.002 * Math.sin(angle)).toFixed(5)),
      status: 'operational' as const,
    };

    community.waterSources.push(ws);
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'ADD_WATER_SOURCE',
      entityType: 'communities',
      entityId: community.id,
      details: `Added water source ${ws.name} (${ws.sourceType}) to ${community.name}.`,
    });
    saveDatabase(db);
    res.status(201).json({ waterSource: ws, community });
  });

  app.patch('/api/communities/:id/water-sources/:sourceId', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === req.params.id);
    if (!community) {
      res.status(404).json({ error: 'Community not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, community.id)) {
      res.status(403).json({ error: 'Not authorized for this community.' });
      return;
    }

    const ws = community.waterSources.find((w) => w.id === req.params.sourceId);
    if (!ws) {
      res.status(404).json({ error: 'Water source not found.' });
      return;
    }
    const allowedStatuses = ['operational', 'suspected', 'tested_contaminated', 'closed_treated'];
    if (!allowedStatuses.includes(req.body?.status)) {
      res.status(400).json({ error: 'Invalid water source status.' });
      return;
    }

    ws.status = req.body.status;
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'UPDATE_WATER_SOURCE_STATUS',
      entityType: 'communities',
      entityId: community.id,
      details: `Updated water source ${ws.name} status to ${ws.status}.`,
    });
    saveDatabase(db);
    res.json({ waterSource: ws });
  });

  // ---------------------------------------------------------------------------
  // Health Reports (Privacy-Preserving & RBAC-Scoped)
  // ---------------------------------------------------------------------------
  app.get('/api/reports', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;

    let visibleReports: HealthReport[] = [];
    if (user.role === 'admin') {
      visibleReports = db.healthReports;
    } else if (user.role === 'health_worker') {
      visibleReports = db.healthReports.filter((r) => user.assignedCommunityIds.includes(r.communityId));
    } else {
      // Residents strictly see only their own submitted reports
      visibleReports = db.healthReports.filter((r) => r.reporterUid === user.id);
    }

    const sorted = [...visibleReports].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ reports: sorted });
  });

  app.post('/api/reports', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const parsed = symptomReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid report payload.' });
      return;
    }

    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === parsed.data.communityId && c.active);
    if (!community) {
      res.status(400).json({ error: 'Selected community was not found.' });
      return;
    }

    const user = req.authUser!;
    if (user.role === 'health_worker' && !canAccessCommunity(user, community.id)) {
      res.status(403).json({ error: 'You are not assigned to submit reports for this community.' });
      return;
    }

    let waterSourceLabel: string | undefined;
    if (parsed.data.suspectedWaterSourceId) {
      const ws = community.waterSources.find((w) => w.id === parsed.data.suspectedWaterSourceId);
      if (!ws) {
        res.status(400).json({ error: 'Selected water source does not belong to this community.' });
        return;
      }
      waterSourceLabel = ws.name;
    }

    const { approxLat, approxLng } = computePrivacyFuzzedCoordinates(
      community,
      parsed.data.suspectedWaterSourceId
    );
    const now = new Date().toISOString();

    const newReport: HealthReport = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reporterUid: user.id,
      communityId: community.id,
      communityName: community.name,
      symptoms: parsed.data.symptoms,
      severity: parsed.data.severity,
      onsetDate: parsed.data.onsetDate,
      affectedCount: parsed.data.affectedCount,
      ageGroup: parsed.data.ageGroup,
      suspectedWaterSourceId: parsed.data.suspectedWaterSourceId || undefined,
      suspectedWaterSourceLabel: waterSourceLabel,
      notes: stripHtml(parsed.data.notes),
      approxLat,
      approxLng,
      verificationStatus: 'pending',
      isSimulated: false,
      createdAt: now,
      updatedAt: now,
    };

    db.healthReports.unshift(newReport);
    recordAuditLog(db, {
      actorUid: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: 'SUBMIT_HEALTH_REPORT',
      entityType: 'healthReports',
      entityId: newReport.id,
      details: `Submitted ${newReport.severity} report in ${community.name} (${newReport.symptoms.join(', ')}).`,
    });
    saveDatabase(db);

    res.status(201).json({ report: newReport });
  });

  // ---------------------------------------------------------------------------
  // Privacy-Conscious Geographic Map Data
  // ---------------------------------------------------------------------------
  app.get('/api/map-data', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;

    // Filter out false reports from map risk display
    const falseIds = new Set(
      db.fieldVerifications.filter((v) => v.outcome === 'false_report').map((v) => v.reportId)
    );

    const allowedCommunities =
      user.role === 'admin'
        ? db.communities
        : user.role === 'health_worker'
          ? db.communities.filter((c) => user.assignedCommunityIds.includes(c.id))
          : db.communities;

    const allowedCommunityIds = new Set(allowedCommunities.map((c) => c.id));

    const mapReports: PublicMapReport[] = db.healthReports
      .filter((r) => allowedCommunityIds.has(r.communityId) && !falseIds.has(r.id))
      .map((r) => ({
        id: r.id,
        communityId: r.communityId,
        communityName: r.communityName,
        symptoms: r.symptoms,
        severity: r.severity,
        affectedCount: r.affectedCount,
        suspectedWaterSourceId: r.suspectedWaterSourceId,
        suspectedWaterSourceLabel: r.suspectedWaterSourceLabel,
        approxLat: r.approxLat,
        approxLng: r.approxLng,
        verificationStatus: r.verificationStatus,
        isSimulated: r.isSimulated,
        createdAt: r.createdAt,
      }));

    const detections = runDetectionAcrossCommunities(
      allowedCommunities,
      db.healthReports,
      db.fieldVerifications,
      db.thresholdConfig
    );

    const activeAlerts = db.alerts.filter(
      (a) => allowedCommunityIds.has(a.communityId) && a.status !== 'resolved'
    );

    res.json({
      communities: allowedCommunities,
      mapReports,
      detections,
      activeAlerts,
    });
  });

  // ---------------------------------------------------------------------------
  // Field Verifications (Health Worker & Admin)
  // ---------------------------------------------------------------------------
  app.get('/api/verifications', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;
    const items =
      user.role === 'admin'
        ? db.fieldVerifications
        : db.fieldVerifications.filter((v) => user.assignedCommunityIds.includes(v.communityId));

    res.json({
      verifications: [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  });

  app.post('/api/verifications', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const parsed = fieldVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid verification payload.' });
      return;
    }

    const db = loadDatabase();
    const report = db.healthReports.find((r) => r.id === parsed.data.reportId);
    if (!report) {
      res.status(404).json({ error: 'Health report not found.' });
      return;
    }

    const user = req.authUser!;
    if (!canAccessCommunity(user, report.communityId)) {
      res.status(403).json({ error: 'Not authorized to verify reports in this community.' });
      return;
    }

    const now = new Date().toISOString();
    const verification: FieldVerification = {
      id: `fv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reportId: report.id,
      communityId: report.communityId,
      workerUid: user.id,
      workerName: user.displayName,
      outcome: parsed.data.outcome,
      waterSampleTaken: parsed.data.waterSampleTaken,
      clinicalNotes: stripHtml(parsed.data.clinicalNotes),
      householdsVisited: parsed.data.householdsVisited,
      createdAt: now,
    };

    // Update report verification status cleanly based on outcome
    if (parsed.data.outcome === 'confirmed_cluster') {
      report.verificationStatus = 'verified';
    } else if (parsed.data.outcome === 'requires_lab_test') {
      report.verificationStatus = 'under_review';
    } else if (parsed.data.outcome === 'false_report') {
      report.verificationStatus = 'unconfirmed';
    } else {
      report.verificationStatus = 'resolved';
    }
    report.updatedAt = now;

    db.fieldVerifications.unshift(verification);
    recordAuditLog(db, {
      actorUid: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: 'SUBMIT_FIELD_VERIFICATION',
      entityType: 'fieldVerifications',
      entityId: verification.id,
      details: `Verified report ${report.id} as ${verification.outcome} (new status: ${report.verificationStatus}).`,
    });
    saveDatabase(db);

    res.status(201).json({ verification, updatedReport: report });
  });

  // ---------------------------------------------------------------------------
  // Statistical Detection & Server-Side Gemini AI Intelligence
  // ---------------------------------------------------------------------------
  app.get('/api/intelligence/summary', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;

    const scopedCommunities =
      user.role === 'admin'
        ? db.communities
        : user.role === 'health_worker'
          ? db.communities.filter((c) => user.assignedCommunityIds.includes(c.id))
          : db.communities.filter((c) => c.id === user.primaryCommunityId);

    const detections = runDetectionAcrossCommunities(
      scopedCommunities.length > 0 ? scopedCommunities : db.communities,
      db.healthReports,
      db.fieldVerifications,
      db.thresholdConfig
    );

    const allowedIds = new Set(scopedCommunities.map((c) => c.id));
    const assessments =
      user.role === 'resident'
        ? [] // Residents receive public advisories/alerts, not raw internal intelligence drafts
        : db.riskAssessments
            .filter((a) => user.role === 'admin' || allowedIds.has(a.communityId))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aggregate metrics
    const visibleReports =
      user.role === 'admin'
        ? db.healthReports
        : user.role === 'health_worker'
          ? db.healthReports.filter((r) => user.assignedCommunityIds.includes(r.communityId))
          : db.healthReports.filter((r) => r.communityId === user.primaryCommunityId);

    const awaitingVerification = visibleReports.filter(
      (r) => r.verificationStatus === 'pending' || r.verificationStatus === 'under_review'
    ).length;

    const activeAlertsCount = db.alerts.filter(
      (a) => (user.role === 'admin' || allowedIds.has(a.communityId)) && a.status !== 'resolved'
    ).length;

    res.json({
      detections,
      thresholdConfig: db.thresholdConfig,
      assessments,
      metrics: {
        totalReports: visibleReports.length,
        awaitingVerification,
        activeAlertsCount,
        verifiedReports: visibleReports.filter((r) => r.verificationStatus === 'verified').length,
        activeInvestigations: db.investigations.filter(
          (i) => (user.role === 'admin' || allowedIds.has(i.communityId)) && i.status !== 'closed'
        ).length,
      },
    });
  });

  app.put('/api/intelligence/thresholds', requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const parsed = thresholdConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid threshold configuration.' });
      return;
    }

    const db = loadDatabase();
    db.thresholdConfig = parsed.data;
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'UPDATE_THRESHOLDS',
      entityType: 'thresholdConfig',
      entityId: 'global',
      details: `Updated detection thresholds: window=${parsed.data.windowHours}h, multiplier=${parsed.data.volumeMultiplierThreshold}x, z=${parsed.data.zScoreThreshold}.`,
    });
    saveDatabase(db);

    res.json({ thresholdConfig: db.thresholdConfig });
  });

  app.post('/api/intelligence/analyze', requireRole('health_worker', 'admin'), aiRateLimit, async (req: AuthenticatedRequest, res) => {
    const communityId = typeof req.body?.communityId === 'string' ? req.body.communityId : '';
    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === communityId);
    if (!community) {
      res.status(404).json({ error: 'Community not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, community.id)) {
      res.status(403).json({ error: 'Not authorized to run intelligence analysis for this community.' });
      return;
    }

    const allDetections = runDetectionAcrossCommunities(
      db.communities,
      db.healthReports,
      db.fieldVerifications,
      db.thresholdConfig
    );
    const detection =
      allDetections.find((d) => d.communityId === community.id) ||
      runStatisticalDetectionForCommunity(
        community,
        db.healthReports,
        db.fieldVerifications,
        db.thresholdConfig,
        []
      );

    const windowStart = Date.now() - db.thresholdConfig.windowHours * 3600 * 1000;
    const recentReports = db.healthReports.filter(
      (r) => r.communityId === community.id && new Date(r.createdAt).getTime() >= windowStart
    );
    const communityVerifications = db.fieldVerifications.filter((v) => v.communityId === community.id);

    try {
      const assessment = await generateCommunityRiskAssessment({
        detection,
        recentReports,
        verifications: communityVerifications,
        thresholdConfig: db.thresholdConfig,
        actorUid: req.authUser!.id,
      });

      db.riskAssessments.unshift(assessment);
      recordAuditLog(db, {
        actorUid: req.authUser!.id,
        actorRole: req.authUser!.role,
        actorEmail: req.authUser!.email,
        action: 'RUN_GEMINI_ASSESSMENT',
        entityType: 'riskAssessments',
        entityId: assessment.id,
        details: `Generated Gemini AI risk assessment for ${community.name} (riskLevel=${assessment.riskLevel}).`,
      });
      saveDatabase(db);

      res.status(201).json({ assessment, detection });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI assessment.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/intelligence/dismiss', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const parsed = observationDismissSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Provide a dismissal rationale note.' });
      return;
    }

    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === parsed.data.communityId);
    if (!community) {
      res.status(404).json({ error: 'Community not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, community.id)) {
      res.status(403).json({ error: 'Not authorized to annotate observations for this community.' });
      return;
    }

    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'DISMISS_OBSERVATION',
      entityType: 'riskAssessments',
      entityId: community.id,
      details: `Reviewed and dismissed statistical observation for ${community.name}: "${stripHtml(parsed.data.note)}"`,
    });
    saveDatabase(db);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Alerts & Resident Advisories
  // ---------------------------------------------------------------------------
  app.get('/api/alerts', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;

    const alerts = db.alerts.filter((a) => {
      if (user.role === 'admin') return true;
      if (user.role === 'health_worker') return user.assignedCommunityIds.includes(a.communityId);
      return a.communityId === user.primaryCommunityId || a.status === 'active';
    });

    res.json({
      alerts: [...alerts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    });
  });

  app.post('/api/alerts', requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const parsed = alertCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid alert payload.' });
      return;
    }

    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === parsed.data.communityId);
    if (!community) {
      res.status(404).json({ error: 'Community not found.' });
      return;
    }

    const now = new Date().toISOString();
    const alert: AlertRecord = {
      id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      communityId: community.id,
      communityName: community.name,
      title: stripHtml(parsed.data.title),
      severity: parsed.data.severity,
      status: 'active',
      classification: parsed.data.classification,
      summary: stripHtml(parsed.data.summary),
      advisoryMessageForResidents: stripHtml(parsed.data.advisoryMessageForResidents),
      linkedAssessmentId: parsed.data.linkedAssessmentId,
      linkedReportIds: parsed.data.linkedReportIds,
      createdByUid: req.authUser!.id,
      createdAt: now,
      updatedAt: now,
    };

    const notif: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      targetRole: 'resident',
      targetCommunityId: community.id,
      title: alert.title,
      message: alert.advisoryMessageForResidents,
      severity: alert.severity === 'critical' || alert.severity === 'warning' ? 'warning' : 'advisory',
      readByUids: [],
      createdAt: now,
    };

    db.alerts.unshift(alert);
    db.notifications.unshift(notif);
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'CREATE_ALERT',
      entityType: 'alerts',
      entityId: alert.id,
      details: `Issued ${alert.severity} alert (${alert.classification}) for ${community.name}.`,
    });
    saveDatabase(db);

    res.status(201).json({ alert });
  });

  app.patch('/api/alerts/:id', requireRole('admin', 'health_worker'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const alert = db.alerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, alert.communityId)) {
      res.status(403).json({ error: 'Not authorized for this community alert.' });
      return;
    }

    const nextStatus = req.body?.status;
    if (!['active', 'acknowledged', 'resolved'].includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid alert status.' });
      return;
    }
    if (nextStatus === 'resolved' && req.authUser!.role !== 'admin') {
      res.status(403).json({ error: 'Only Health Administrators can resolve alerts.' });
      return;
    }

    alert.status = nextStatus;
    alert.updatedAt = new Date().toISOString();
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'UPDATE_ALERT_STATUS',
      entityType: 'alerts',
      entityId: alert.id,
      details: `Updated alert ${alert.id} status to ${nextStatus}.`,
    });
    saveDatabase(db);

    res.json({ alert });
  });

  // ---------------------------------------------------------------------------
  // Investigations & Field Interventions
  // ---------------------------------------------------------------------------
  app.get('/api/investigations', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;
    const investigations =
      user.role === 'admin'
        ? db.investigations
        : db.investigations.filter((i) => user.assignedCommunityIds.includes(i.communityId));

    const interventions =
      user.role === 'admin'
        ? db.interventions
        : db.interventions.filter((iv) => user.assignedCommunityIds.includes(iv.communityId));

    res.json({
      investigations: [...investigations].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
      interventions: [...interventions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  });

  app.post('/api/investigations', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const parsed = investigationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid investigation data.' });
      return;
    }

    const db = loadDatabase();
    const community = db.communities.find((c) => c.id === parsed.data.communityId);
    if (!community) {
      res.status(404).json({ error: 'Community not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, community.id)) {
      res.status(403).json({ error: 'Not authorized to open an investigation in this community.' });
      return;
    }

    const leadWorker = parsed.data.leadWorkerUid
      ? db.users.find((u) => u.id === parsed.data.leadWorkerUid)
      : db.users.find((u) => u.role === 'health_worker' && u.assignedCommunityIds.includes(community.id));

    const now = new Date().toISOString();
    const inv: Investigation = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      communityId: community.id,
      communityName: community.name,
      title: stripHtml(parsed.data.title),
      alertId: parsed.data.alertId,
      leadWorkerUid: leadWorker?.id || req.authUser!.id,
      leadWorkerName: leadWorker?.displayName || req.authUser!.displayName,
      status: 'open',
      priority: parsed.data.priority,
      findingsSummary: stripHtml(parsed.data.findingsSummary),
      linkedReportIds: parsed.data.linkedReportIds,
      createdByUid: req.authUser!.id,
      createdAt: now,
      updatedAt: now,
    };

    db.investigations.unshift(inv);
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'CREATE_INVESTIGATION',
      entityType: 'investigations',
      entityId: inv.id,
      details: `Opened ${inv.priority} investigation "${inv.title}" in ${community.name}.`,
    });
    saveDatabase(db);

    res.status(201).json({ investigation: inv });
  });

  app.patch('/api/investigations/:id', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const inv = db.investigations.find((i) => i.id === req.params.id);
    if (!inv) {
      res.status(404).json({ error: 'Investigation not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, inv.communityId)) {
      res.status(403).json({ error: 'Not authorized to update this investigation.' });
      return;
    }

    const allowedStatuses = ['open', 'field_dispatch', 'sampling', 'contained', 'closed'];
    if (req.body?.status) {
      if (!allowedStatuses.includes(req.body.status)) {
        res.status(400).json({ error: 'Invalid investigation status.' });
        return;
      }
      inv.status = req.body.status;
    }
    if (typeof req.body?.findingsSummary === 'string' && req.body.findingsSummary.trim().length >= 5) {
      inv.findingsSummary = stripHtml(req.body.findingsSummary).slice(0, 1000);
    }
    inv.updatedAt = new Date().toISOString();

    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'UPDATE_INVESTIGATION',
      entityType: 'investigations',
      entityId: inv.id,
      details: `Updated investigation ${inv.id} status to ${inv.status}.`,
    });
    saveDatabase(db);

    res.json({ investigation: inv });
  });

  app.post('/api/interventions', requireRole('health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const parsed = interventionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid intervention data.' });
      return;
    }

    const db = loadDatabase();
    const inv = db.investigations.find((i) => i.id === parsed.data.investigationId);
    if (!inv) {
      res.status(404).json({ error: 'Parent investigation not found.' });
      return;
    }
    if (!canAccessCommunity(req.authUser!, inv.communityId)) {
      res.status(403).json({ error: 'Not authorized to record interventions for this community.' });
      return;
    }

    const intervention: Intervention = {
      id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      investigationId: inv.id,
      communityId: inv.communityId,
      actionType: parsed.data.actionType,
      description: stripHtml(parsed.data.description),
      householdsReached: parsed.data.householdsReached,
      status: parsed.data.status,
      recordedByUid: req.authUser!.id,
      recordedByName: req.authUser!.displayName,
      createdAt: new Date().toISOString(),
    };

    db.interventions.unshift(intervention);
    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'RECORD_INTERVENTION',
      entityType: 'interventions',
      entityId: intervention.id,
      details: `Logged ${intervention.actionType} (${intervention.householdsReached} households) under ${inv.id}.`,
    });
    saveDatabase(db);

    res.status(201).json({ intervention });
  });

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------
  app.get('/api/notifications', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const user = req.authUser!;

    const visible = db.notifications.filter((n) => {
      const roleMatch = n.targetRole === 'all' || n.targetRole === user.role;
      if (!roleMatch) return false;
      if (!n.targetCommunityId) return true;
      if (user.role === 'admin') return true;
      if (user.role === 'health_worker') return user.assignedCommunityIds.includes(n.targetCommunityId);
      return user.primaryCommunityId === n.targetCommunityId;
    });

    res.json({
      notifications: [...visible].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  });

  app.post('/api/notifications/:id/read', requireRole('resident', 'health_worker', 'admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const notif = db.notifications.find((n) => n.id === req.params.id);
    if (!notif) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    const user = req.authUser!;
    const roleMatch = notif.targetRole === 'all' || notif.targetRole === user.role;
    const communityMatch = !notif.targetCommunityId || canAccessCommunity(user, notif.targetCommunityId);
    if (!roleMatch || !communityMatch) {
      res.status(403).json({ error: 'Not authorized to access this notification.' });
      return;
    }
    if (!notif.readByUids.includes(user.id)) {
      notif.readByUids.push(user.id);
      saveDatabase(db);
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Administrative Management & Audit Logs
  // ---------------------------------------------------------------------------
  app.get('/api/admin/users', requireRole('admin'), (_req, res) => {
    const db = loadDatabase();
    res.json({ users: db.users.map(sanitizeUser) });
  });

  app.patch('/api/admin/users/:id', requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { role, assignedCommunityIds, active } = req.body ?? {};
    if (role && ['resident', 'health_worker', 'admin'].includes(role)) {
      if (target.id === req.authUser!.id && role !== 'admin') {
        res.status(400).json({ error: 'You cannot demote your own administrator role.' });
        return;
      }
      target.role = role;
    }
    if (Array.isArray(assignedCommunityIds)) {
      const validIds = new Set(db.communities.map((c) => c.id));
      target.assignedCommunityIds = assignedCommunityIds.filter(
        (id: unknown): id is string => typeof id === 'string' && validIds.has(id)
      );
    }
    if (typeof active === 'boolean') {
      if (target.id === req.authUser!.id && !active) {
        res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
        return;
      }
      target.active = active;
    }

    recordAuditLog(db, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'UPDATE_USER_ACCESS',
      entityType: 'users',
      entityId: target.id,
      details: `Updated ${target.email}: role=${target.role}, active=${target.active}, communities=${target.assignedCommunityIds.join(',')}.`,
    });
    saveDatabase(db);

    res.json({ user: sanitizeUser(target) });
  });

  app.get('/api/admin/audit-logs', requireRole('admin'), (_req, res) => {
    const db = loadDatabase();
    res.json({ auditLogs: db.auditLogs.slice(0, 150) });
  });

  app.post('/api/admin/reset-demo', requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const fresh = resetDemoDatabase();
    recordAuditLog(fresh, {
      actorUid: req.authUser!.id,
      actorRole: req.authUser!.role,
      actorEmail: req.authUser!.email,
      action: 'RESET_DEMO_DATASET',
      entityType: 'system',
      entityId: 'demo',
      details: 'Reset simulated demonstration dataset to baseline scenarios.',
    });
    saveDatabase(fresh);
    res.json({ ok: true });
  });

  // Explicit JSON 404 for unknown API paths so production SPA fallback never serves HTML to API callers
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // ---------------------------------------------------------------------------
  // Frontend Serving (Vite Dev Middleware or Production Static Dist)
  // ---------------------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`HealthAlert server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start HealthAlert server:', err);
  process.exit(1);
});
