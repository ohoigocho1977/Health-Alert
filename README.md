# HealthAlert

**AI-Powered Community Health Surveillance & Early-Warning Platform**  
*Developed for the USPF Changemaker Challenge*

HealthAlert is a full-stack community health surveillance and early-warning web application focused on detecting unusual patterns of waterborne illness symptoms (such as watery diarrhoea and vomiting) before localized clusters escalate into wider public-health emergencies.

> **Important Notice on Simulation & Clinical Scope**  
> All pre-loaded community records in HealthAlert are **simulated demonstration scenarios** clearly labelled as demonstration data. HealthAlert is an operational early-warning and investigation-coordination tool: it **never issues medical diagnoses** and **never declares official disease outbreaks** autonomously.

---

## Problem Statement

Early community health signals—such as multiple households reporting acute diarrhoea or vomiting around a shared borehole or shallow well—are often fragmented across informal channels, delayed in paper logs, or disconnected from water-source tracking. By the time clinics notice severe admissions, contamination may already have spread across neighbouring wards.

## Proposed Solution

HealthAlert connects three core user roles inside a single, privacy-conscious, role-scoped platform:

1. **Community Residents**: Submit a 1-minute symptom report (community, symptoms, onset timing, number affected, suspected water source) without exposing names or street addresses, track verification status, and read public health advisories.
2. **Community Health Workers (CHWs)**: Receive mobile-first prioritized verification tasks (`Today`), inspect incoming reports, conduct household field visits, update water source conditions, manage assigned investigations, and document field interventions (ORS/zinc distribution, boil-water advisories, chlorination, lab sampling).
3. **Health Administrators**: Monitor community-wide reporting trends vs. expected baselines, inspect deterministic statistical anomalies, generate server-side Gemini AI pattern explanations with uncertainty statements, configure detection thresholds, issue public alerts, govern communities/water sources, manage user roles, and audit security logs.

---

## Key Features

- **1-Minute Resident Reporting** with automatic privacy-preserving coordinate jitter (`300m–550m`) and reference ID generation.
- **Deterministic Statistical Detection Engine** evaluating 6 transparent signals: reporting volume multiplier, z-score deviation, Haversine spatial clustering, shared water-source convergence, clinical severity escalation, and cross-community divergence.
- **Server-Side Gemini AI Intelligence (`gemini-4-hydrogen`)** generating structured risk explanations, investigation priorities, and explicit uncertainty statements strictly grounded in statistical metrics and traceable report IDs.
- **5-Stage Surveillance Classification**: clearly separates *Baseline Individual Reports*, *Unusual Reporting Activity*, *Potential Health Threat*, *Human-Verified Incident*, and *Officially Confirmed Outbreak*.
- **Interactive Community Risk Map** (Leaflet + OpenStreetMap) displaying privacy-fuzzed report points, detected geographic cluster rings, and monitored water sources.
- **End-to-End Investigation & Intervention Tracking** from initial report through field verification, water sampling, and household-reach documentation.
- **One-Click Demonstration Reset** (`Settings -> Reset demonstration dataset`) for repeatable evaluations.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Recharts, React Hook Form + Zod, Leaflet.
- **Backend API**: Node.js + Express (`server.ts`), TypeScript, `scrypt` password hashing, HMAC-SHA256 HTTP-only cookie + Bearer token sessions, rate limiting, and atomic JSON file persistence (`.data/healthalert-db.json`).
- **AI Engine**: Google Gemini API (`@google/genai`, model `gemini-4-hydrogen`) invoked exclusively server-side with structured JSON schemas.

---

## System Architecture

```text
Browser (React + Vite + Tailwind + Leaflet + Recharts)
   │  HTTPS / Cookie + Bearer Session Token
   ▼
Express API Server (server.ts — Port 3000)
   ├── Auth & RBAC Middleware (server/auth.ts)
   ├── Validation Schemas (src/shared/types.ts — Zod)
   ├── Deterministic Detection Engine (server/detectionEngine.ts)
   ├── Gemini AI Service (server/geminiService.ts — server-side GEMINI_API_KEY)
   └── Atomic JSON Datastore (server/store.ts -> .data/healthalert-db.json)
```

---

## Installation & Environment Configuration

### Prerequisites
- Node.js `v22+`
- A server-side `GEMINI_API_KEY` (configured via environment variables or the AI Studio Secrets panel)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` for local execution (never commit `.env` or API keys):
```env
GEMINI_API_KEY="your_server_side_gemini_api_key"
APP_URL="http://localhost:3000"
```
Optional production secret for session token signing:
```env
HEALTHALERT_SESSION_SECRET="strong_random_secret_string"
```

---

## Running the Application

### Development Mode
Runs Express with Vite middleware on port `3000`:
```bash
npm run dev
```

### Type-Check & Production Build
```bash
npm run lint
npm run build
```

### Production Mode
Serves compiled assets from `dist/` and all `/api/*` endpoints from Express on port `3000`:
```bash
NODE_ENV=production npm start
```

---

## Deployment Instructions

1. Ensure `GEMINI_API_KEY` and `HEALTHALERT_SESSION_SECRET` are injected in your hosting environment (Cloud Run / Node host).
2. Run `npm run build` to compile the frontend into `dist/`.
3. Start the server with `NODE_ENV=production npm start` (bound to `0.0.0.0:$PORT`, defaulting to `3000`).
4. Verify `GET /api/health` returns `{ "status": "ok" }` and SPA routes (`/login`, `/admin`, `/worker`, `/resident`) render cleanly.

---

## Demo Instructions

See [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) for the step-by-step evaluation walkthrough using the built-in **Demonstration Role Access** panel on `/login`.
