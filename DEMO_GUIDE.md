# HealthAlert — Evaluator Demonstration Guide

This guide walks judges and evaluators through the complete simulated end-to-end HealthAlert surveillance scenario—from baseline reporting to anomaly detection, Gemini AI synthesis, field verification, and documented response.

> **Important**: All pre-populated records are clearly labelled **simulated demonstration data**. No real patient information is stored or displayed.

---

## 1. Signing In for the Demonstration

Open `/login`. On the left panel (**Demonstration Role Access**), click any role button for instant one-click authentication (no password entry required in the evaluation UI):

| Role Button | Account Persona | Default Landing Route |
| --- | --- | --- |
| **Health Administrator** | Dr. Amina Bello (State Surveillance Lead) | `/admin` |
| **Community Health Worker** | Tunde Adeyemi (CHEW - Makoko & Ajegunle) | `/worker` |
| **Community Resident** | Kemi Ogunleye (Makoko Resident) | `/resident` |

*(If testing resident self-registration, switch to the **Resident registration** tab on `/login` and create a new account with your own test password; new self-registrations strictly receive `resident` permissions.)*

---

## 2. Step-by-Step End-to-End Walkthrough

### Step 1 — Resident Experience (1-Minute Reporting & Advisories)
1. Click **Community Resident** on `/login` to land on `/resident`.
2. Observe the low-friction form:
   - Select **Makoko Waterfront**.
   - Choose symptoms (e.g., **Watery Diarrhoea** and **Vomiting**).
   - Select onset (**Yesterday** or **Today**), affected count (e.g., `2`), and suspected water source (**Apollo Borehole Point A**).
3. Click **Send report**.
4. **Expected Behavior**: The system returns a unique reference number (e.g., `rep-...`) and stores privacy-fuzzed coordinates (`300m–550m` offset). Scroll down to see **Community Health Advisories** (including unread notifications with **Mark read**) and **Recent Submissions** (or open `/reports` to track status).

### Step 2 — Statistical Pattern Detection & Gemini AI Intelligence
1. Sign out and sign in as **Health Administrator** (`/admin`).
2. On **Overview** (`/admin`), verify:
   - The 4 KPI cards (Total Reports, Last 24 Hours, Awaiting Verification, Potential Alerts).
   - The 14-day daily report trend chart vs. expected baseline range band.
   - The **Emerging Symptom Patterns (7-Day Frequency)** chart.
   - Notice **Makoko Waterfront** (`Human-Verified Incident` / High) vs. **Ikorodu North** and **Surulere Central** (normal baseline activity).
3. Click **Open intelligence** (or go to `/intelligence`).
4. On **Risk Intelligence**:
   - Inspect the **5-Stage Surveillance Classification** bar showing how HealthAlert separates unverified/statistical signals from verified incidents and official outbreaks.
   - Review the **Statistical Observation** card (48h volume vs. expected baseline, z-score, multiplier, and triggered signals including **Geographic Report Cluster** and **Shared Water Source Convergence** on *Apollo Borehole Point A*).
   - Click **Run Gemini analysis** to trigger a live server-side `gemini-4-hydrogen` assessment returning an executive summary, pattern explanation citing report IDs, prioritized actions, and explicit uncertainty statements.
   - Open **Community Risk Map** (`/map`) to see privacy-fuzzed report markers, the dashed red geographic cluster ring in Makoko, and `W` water source markers.

### Step 3 — Community Health Worker Field Verification & Interventions
1. Sign out and sign in as **Community Health Worker** (`/worker`).
2. On **Today, Makoko Waterfront**:
   - Review the red-bordered **Urgent** task card and the **Awaiting Verification** queue (which now includes the newly submitted resident report from Step 1).
   - Click **Verify** on a pending report, select an outcome (e.g., `Confirmed Cluster`), check **Water sample taken**, enter field observations, and click **Save verification**.
   - Switch to the **Investigations** tab (or **Cases** on mobile) to update an active investigation's status (`sampling` -> `contained`) and edit field findings.
   - Click **+ Log intervention** on `inv-makoko-01`, record e.g. `ORS / Zinc Distribution` or `Water Chlorination` with households reached, and save.

### Step 4 — Administrator Tracking, Alerts & Reset
1. Sign back in as **Health Administrator** (`/admin`).
2. Confirm the updated report verification status on `/reports`, documented intervention on `/investigations`, and full audit trail on `/settings`.
3. To restore the clean baseline scenario for the next judge or presentation, go to `/settings` and click **Reset demonstration dataset**.

---

## 3. Key Evaluation Points for Judges

- **Non-Diagnostic Discipline**: AI summaries explain patterns and uncertainties—never diagnosing patients or declaring outbreaks automatically.
- **Privacy Protection**: Exact household coordinates and resident names never appear in public maps or shared reports.
- **Mobile Usability**: Resize to a mobile viewport (`375px`) on `/resident` and `/worker` to observe the mobile-first CHW bottom action bar and single-column resident card.
