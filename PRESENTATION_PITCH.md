# HealthAlert — Hackathon Presentation, Demo Script & Judges' FAQ

*USPF Changemaker Challenge Submission Materials*

---

## 1. Project Pitch

### The Problem
Every year, preventable waterborne outbreaks—such as acute watery diarrhoea and cholera—spread rapidly across vulnerable Nigerian communities before health authorities can pinpoint the source. Early household symptoms are scattered across informal conversations, while community health workers and LGA surveillance teams lack a unified tool to link symptom spikes to shared water points early.

### Target Population
- **Community residents** in peri-urban, riverine, and underserved wards who need a fast, safe, anonymous way to report sudden illness clusters.
- **Community Health Workers (CHWs / CHEWs)** conducting household visits and water-point checks in the field.
- **Local and State Health Administrators** coordinating rapid surveillance, lab sampling, and public advisories.

### Our Solution: HealthAlert
HealthAlert is an AI-assisted community health surveillance and early-warning platform. Residents submit symptom reports in under 1 minute without sharing names or street addresses. A deterministic statistical engine screens incoming reports for abnormal surges, geographic clusters, and shared water-source convergence, while Google Gemini synthesizes those signals into actionable briefs for human health workers to verify and resolve.

### How It Works
1. **Report**: Residents report symptoms, onset timing, affected household count, and suspected water source. Coordinates are automatically offset by `300m–550m` for privacy.
2. **Detect**: Deterministic algorithms compare 48-hour reporting volume against 14-day baselines, compute z-scores, detect `850m` Haversine clusters, and flag shared water points.
3. **Explain (Gemini AI)**: Server-side Gemini generates clear explanations citing exact report IDs, suggested priorities, and explicit uncertainty statements.
4. **Verify & Act**: CHWs receive urgent mobile tasks, conduct household visits, update water-source status, and log interventions (ORS distribution, chlorination, boil-water advisories).

### AI Innovation & Safety
Unlike black-box chatbots, HealthAlert separates **deterministic statistical screening** from **AI explanation** and **human verification**:
- Five explicit stages prevent automated false alarms: *Baseline Individual Reports* → *Unusual Reporting Activity* → *Potential Health Threat* → *Human-Verified Incident* → *Officially Confirmed Outbreak*.
- Gemini is strictly forbidden from diagnosing patients or declaring outbreaks.

### Expected Impact, Scalability & Sustainability
- **Intended Impact**: Shorter lag between early household symptom clusters and targeted field verification or water-point intervention (demonstrated in simulated Lagos ward scenarios; live field validation is planned for pilot rollout).
- **Scalability**: Communities, population baselines, and water sources are configurable in the admin portal without code changes, and the REST API supports future SMS/USSD/WhatsApp intake channels.
- **Sustainability**: Built on lightweight open web standards designed for adoption by State Ministries of Health, LGA disease surveillance officers (DSNOs), and community-based primary healthcare networks.

---

## 2. Technical Demonstration Script (3–5 Minutes)

### Minute 0:00–0:45 — Problem & Resident Intake
- Show `/login`, briefly introduce the three roles, and click **Community Resident** (`/resident`).
- Submit a 1-minute report for **Makoko Waterfront** (*Watery Diarrhoea + Vomiting*, *2 people*, *Apollo Borehole Point A*).
- Point out the generated reference ID, privacy notice ("no names or street addresses"), and resident advisories feed.

### Minute 0:45–2:15 — Administrator Overview & Statistical + Gemini Intelligence
- Switch to **Health Administrator** (`/admin`).
- Highlight the 4 KPI cards, the 14-day trend vs. baseline band, emerging symptom breakdown, and Makoko's elevated status vs. normal activity in Ikorodu and Surulere.
- Open **Risk Intelligence** (`/intelligence`), show the 5-stage escalation bar, explain the statistical signals (`2.5x` baseline, `850m` cluster, `Apollo Borehole Point A` convergence), and click **Run Gemini analysis** to show live structured AI reasoning with traceable report IDs and uncertainty statements.
- Briefly open **Community Risk Map** (`/map`) to show the dashed cluster ring, water point markers, and `300m–550m` privacy-fuzzed report points.

### Minute 2:15–3:30 — Community Health Worker Field Response
- Switch to **Community Health Worker** (`/worker`).
- Show the mobile-ready `Today, Makoko Waterfront` view. Verify the newly submitted resident report via **Verify** (`Confirmed Cluster`, water sample taken, clinical notes).
- Open the **Investigations** tab, update `inv-makoko-01`, and log a quick intervention (e.g., *Water Chlorination* or *ORS Distribution* reaching 15 households).

### Minute 3:30–4:15 — Governance, Auditability & Wrap-Up
- Return briefly to **Health Administrator** (`/settings`) to show configurable screening thresholds, the live security/audit log of every verification and AI call, and the one-click **Reset demonstration dataset** control.

---

## 3. Judges' FAQ

**Q1: Why focus on waterborne illnesses and diarrhoea/vomiting first?**  
Waterborne threats such as cholera and acute gastroenteritis spread rapidly through shared water points (boreholes, shallow wells, sachet depots), yet respond dramatically to fast local interventions like chlorination, boil-water advisories, and ORS distribution when detected even 24–48 hours earlier.

**Q2: Why use AI instead of only threshold alerts?**  
Statistical rules catch *what* changed (`2.5x` reports, `850m` cluster), while Gemini helps overstretched health administrators and CHEWs quickly understand *why* it matters by synthesizing multiple signals, symptom combinations, and field notes into plain-language priorities and explicit data gaps.

**Q3: How does the early-warning mechanism avoid false alarms and panic?**  
Three safeguards work together: (1) minimum report floors (`minReportsForAnomaly`), (2) cross-community peer comparison to distinguish localized water contamination from broad reporting noise, and (3) a strict 5-stage classification where AI can never declare an outbreak and CHWs can mark reports as `false_report` (immediately excluding them from cluster detection).

**Q4: How are reports verified?**  
Every community report enters as `Awaiting`. Assigned Community Health Workers review the queue, visit households or water points, record whether a water sample was taken, and submit a structured `FieldVerification` (`Confirmed Cluster`, `Requires Lab Test`, `Isolated Case`, or `False Report`).

**Q5: How is sensitive resident health information protected?**  
Residents never submit names, phone numbers, or house addresses. Stored locations receive a `300m–550m` random offset, residents can only view their own submitted reports (`GET /api/reports`), and all role/community checks run server-side with `scrypt` password hashing and `HttpOnly` session cookies.

**Q6: How would this work in real Nigerian communities with low smartphone or data access?**  
The mobile-first web interface is lightweight and low-bandwidth, while the Community Health Worker portal allows trained CHEWs to log household cases (`+ Quick report`) on behalf of residents without smartphones. The JSON REST reporting endpoint is also structured to accept future USSD/SMS gateway submissions.

**Q7: How could Nigerian health authorities adopt HealthAlert?**  
State Primary Health Care Boards and LGA Disease Surveillance and Notification Officers (DSNOs) can configure their own wards, population baselines, and water-source inventories directly in the Communities panel, assign local CHEWs, and tune screening thresholds to match local seasonal baselines.
