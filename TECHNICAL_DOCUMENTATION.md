# HealthAlert — Technical Documentation

---

## 1. Application Architecture

HealthAlert is a full-stack TypeScript web application served by a single Express server (`server.ts`) on port `3000`:

- **Development**: Express mounts Vite's middleware (`vite.middlewares`) for instant SPA serving alongside `/api/*` routes.
- **Production**: `npm run build` outputs the compiled React bundle to `dist/`, and `NODE_ENV=production node server.ts` serves static assets and SPA history fallback while keeping `/api/*` JSON routes isolated.
- **Shared Contracts**: `src/shared/types.ts` defines TypeScript interfaces and Zod validation schemas shared between the React frontend (`react-hook-form`) and Express API endpoints, eliminating schema drift.

---

## 2. Database Structure & Persistence

Because external cloud database provisioning was declined during this workspace session, HealthAlert currently persists data atomically on the server in `.data/healthalert-db.json` via `server/store.ts` (`writeFileSync` to `.tmp` + atomic `renameSync`), modeled as 10 relational/document collections ready for Cloud Firestore or PostgreSQL migration:

| Collection | Purpose | Key Fields & Relationships |
| --- | --- | --- |
| `users` | Account credentials & RBAC | `id`, `email`, `passwordHash` (`scrypt`), `role`, `assignedCommunityIds`, `primaryCommunityId`, `active` |
| `communities` | Configurable pilot zones | `id`, `name`, `state`, `lga`, `ward`, `centerLat/Lng`, `radiusKm`, `baselineDailyReports`, `waterSources[]` |
| `healthReports` | Privacy-fuzzed symptom reports | `id`, `reporterUid`, `communityId`, `symptoms[]`, `severity`, `onsetDate`, `affectedCount`, `suspectedWaterSourceId`, `approxLat/Lng`, `verificationStatus` |
| `fieldVerifications` | CHW on-site checks | `id`, `reportId`, `communityId`, `workerUid`, `outcome`, `waterSampleTaken`, `clinicalNotes`, `householdsVisited` |
| `riskAssessments` | Statistical + Gemini outputs | `id`, `communityId`, `generatedBy`, `statusClassification`, `statisticalSignals[]`, `aiSummary`, `patternExplanation`, `recommendedPriorities[]`, `uncertaintyStatement`, `traceableReportIds[]` |
| `alerts` | Official public health alerts | `id`, `communityId`, `severity`, `status`, `classification`, `summary`, `advisoryMessageForResidents`, `linkedAssessmentId`, `linkedReportIds[]` |
| `investigations` | Field dispatch tracking | `id`, `communityId`, `alertId`, `leadWorkerUid`, `status`, `priority`, `findingsSummary`, `linkedReportIds[]` |
| `interventions` | Documented response actions | `id`, `investigationId`, `communityId`, `actionType`, `description`, `householdsReached`, `status` |
| `notifications` | Targeted advisories & read state | `id`, `targetRole`, `targetCommunityId`, `title`, `message`, `severity`, `readByUids[]` |
| `auditLogs` | Immutable action trail | `id`, `actorUid`, `actorRole`, `action`, `entityType`, `entityId`, `details`, `createdAt` |

---

## 3. API Endpoints

All protected endpoints enforce `requireRole(...)` and community-level authorization (`canAccessCommunity`):

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Communities & Water Sources**: `GET /api/communities`, `POST /api/communities` (`admin`), `POST /api/communities/:id/water-sources` (`health_worker | admin`), `PATCH /api/communities/:id/water-sources/:sourceId` (`health_worker | admin`)
- **Reports & Map**: `GET /api/reports` (role-scoped), `POST /api/reports`, `GET /api/map-data` (anonymized `PublicMapReport[]`)
- **Verifications**: `GET /api/verifications`, `POST /api/verifications` (`health_worker | admin`)
- **Intelligence & AI**: `GET /api/intelligence/summary`, `PUT /api/intelligence/thresholds` (`admin`), `POST /api/intelligence/analyze` (`health_worker | admin`), `POST /api/intelligence/dismiss` (`health_worker | admin`)
- **Alerts & Notifications**: `GET /api/alerts`, `POST /api/alerts` (`admin`), `PATCH /api/alerts/:id`, `GET /api/notifications`, `POST /api/notifications/:id/read`
- **Investigations & Interventions**: `GET /api/investigations`, `POST /api/investigations`, `PATCH /api/investigations/:id`, `POST /api/interventions`
- **Administration**: `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `GET /api/admin/audit-logs`, `POST /api/admin/reset-demo`

---

## 4. Statistical Detection & Gemini AI Workflow

### Deterministic Detection Engine (`server/detectionEngine.ts`)
1. Excludes reports marked `false_report` by CHW field verifications.
2. Computes each community's 48-hour reporting rate against its 14-day empirical/configured baseline and peer communities.
3. Evaluates 6 explicit signals:
   - `volume_surge` (`>= 2.0x` baseline)
   - `z_score_spike` (`>= 1.8σ`)
   - `spatial_cluster` (`>= 3` reports within `850m` via Haversine distance)
   - `water_source_convergence` (`>= 3` reports citing the same water source)
   - `severity_escalation` (`>= 3` acute/severe/bloody/dehydration reports)
   - `cross_community_divergence` (`>= 2.2x` peer community median)
4. Maps signals + field verification counts to a 5-stage `SurveillanceClassification` (never auto-assigning `officially_confirmed_outbreak`).

### Gemini AI Synthesis (`server/geminiService.ts`)
- Uses `@google/genai` (`model: 'gemini-4-hydrogen'`) strictly on the server with `GEMINI_API_KEY`.
- Receives only anonymized report payloads (no user IDs or names), statistical signals, and CHW verification notes.
- Enforces `responseMimeType: 'application/json'` and `responseSchema` with `executiveSummary`, `patternExplanation`, `riskLevel`, `recommendedPriorities`, `uncertaintyStatement`, and `traceableReportIds`.
- Includes exponential-backoff retry (up to 2 retries on transient 429/503/network errors) and graceful error propagation.

---

## 5. Security & Privacy Architecture (NDPR / NDPA Considerations)

- **No Frontend API Keys**: `GEMINI_API_KEY` is read exclusively in `server/geminiService.ts` and never bundled by Vite.
- **Privilege Escalation Prevention**: `POST /api/auth/register` hardcodes `role: 'resident'`; admins cannot deactivate or demote themselves; CHWs are strictly restricted to `assignedCommunityIds`.
- **Household Anonymity**: Reports omit resident names and street addresses. `computePrivacyFuzzedCoordinates()` applies random `300m–550m` coordinate jitter before storing `approxLat`/`approxLng`. Public maps render `PublicMapReport` objects stripped of `reporterUid` and personal notes.
- **Data Protection Alignment**: Designed around Nigeria Data Protection Act (NDPA) data-minimization and purpose-limitation principles (no medical claims or formal regulatory certification are asserted).
- **HTTP Hardening**: `scrypt` per-user salted password hashing, `timingSafeEqual` verification, HMAC-SHA256 `HttpOnly` `SameSite=Lax` cookies (with `Secure` over HTTPS), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, sliding-window rate limiting on auth/AI routes, and HTML character stripping on user inputs.

---

## 6. User Roles & Permissions Matrix

| Capability | Resident | Health Worker | Administrator |
| --- | :---: | :---: | :---: |
| Submit symptom report | Own | Assigned communities | All |
| View reports | Own only | Assigned communities | All |
| View privacy-fuzzed risk map | Yes | Assigned communities | All |
| Verify reports & update water sources | No | Assigned communities | All |
| Run Gemini analysis & view intelligence | No | Assigned communities | All |
| Manage investigations & interventions | No | Assigned communities | All |
| Issue / resolve alerts & manage users/thresholds | No | Acknowledge alerts only | Full |

---

## 7. Deployment Architecture

HealthAlert runs as a single Node.js container (`PORT=3000`, `NODE_ENV=production node server.ts`), serving both the built Vite static bundle (`dist/`) and the Express REST API under one origin to avoid CORS complexity. For multi-instance horizontal scaling, swap `server/store.ts` to a shared managed database (Cloud Firestore or Cloud SQL PostgreSQL).
