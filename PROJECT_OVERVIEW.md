# HealthAlert — Project Overview

*Submitted for the USPF Changemaker Challenge*

---

## 1. The Public-Health Problem

In many peri-urban and underserved communities across Nigeria, waterborne illnesses—including acute watery diarrhoea, dysentery, and cholera-like gastroenteritis—frequently originate from compromised boreholes, shallow wells, damaged drainage, or contaminated water distribution points.

Three operational gaps hinder early response today:

1. **Fragmented Community Signals**: Residents notice stomach illness, vomiting, or diarrhoea in their households days before severe cases arrive at primary health centres, yet there is no low-friction channel linking symptom reports to shared water points.
2. **Delayed Spatial & Temporal Visibility**: Health workers and Local Government Area (LGA) surveillance teams lack automated tools to see when 4–6 sporadic complaints in one ward actually cluster within 850 metres around a single borehole.
3. **Conflation of Rumour and Verified Incident**: Without structured triage separating unverified reports from field-verified investigations, authorities risk either missing early clusters or triggering panic from unverified noise.

---

## 2. Target Beneficiaries

| Beneficiary Group | Role in HealthAlert | Practical Value |
| --- | --- | --- |
| **Community Residents** | Submit rapid 1-minute reports; receive safe-water advisories | Simple reporting without exposing names or street addresses; timely boil-water and ORS guidance |
| **Community Health Workers (CHWs / CHEWs)** | Verify reports on site; inspect water sources; log interventions | Mobile-first task prioritization, structured household check forms, and intervention tracking |
| **Health Administrators & Surveillance Teams** | Monitor trends; review AI + statistical risk intelligence; dispatch investigations | Early anomaly surfacing across configurable pilot communities with full audit trails |

---

## 3. How HealthAlert Works

1. **Low-Friction Resident Reporting**: Residents select their community, symptom(s), onset timing, number of affected household members, and suspected water source. No personal names or house addresses are collected, and coordinates receive a `300m–550m` privacy jitter before storage.
2. **Deterministic Statistical Screening**: Whenever intelligence or map views load, HealthAlert evaluates each community's recent reporting window against its 14-day baseline and peer communities using six transparent indicators (volume multiplier, z-score spike, spatial clustering, water-source convergence, severity escalation, and cross-community divergence).
3. **AI-Assisted Pattern Explanation (Gemini)**: On demand, HealthAlert invokes Google Gemini on the server with anonymized metrics and field notes to produce an understandable operational summary, prioritized field actions, and explicit uncertainty statements.
4. **5-Stage Human-in-the-Loop Escalation**:
   - Stage 1: *Baseline Individual Reports*
   - Stage 2: *Unusual Reporting Activity*
   - Stage 3: *Potential Health Threat*
   - Stage 4: *Human-Verified Incident* (requires CHW field verification)
   - Stage 5: *Officially Confirmed Outbreak* (strictly reserved for authorized public health authorities—never assigned by AI)
5. **Field Verification, Alerts & Intervention Tracking**: CHWs verify reports, update water-source condition statuses, advance investigations (`open` → `field_dispatch` → `sampling` → `contained` → `closed`), and record household interventions (ORS/zinc distribution, chlorination, boil-water advisories).

---

## 4. Innovative Features

- **Hybrid Statistical + Generative AI Intelligence**: Deterministic epidemiological screening thresholds ensure transparency and repeatability, while Gemini translates complex multi-signal outputs into clear operational briefs with cited report IDs.
- **Privacy-by-Design Spatial Clustering**: Detects geographic clusters around shared water infrastructure without storing or plotting exact household locations.
- **Configurable Multi-Community Architecture**: New pilot communities, population baselines, and local water points can be added dynamically by administrators without code changes.
- **Built-In Clinical & Epistemic Guardrails**: Every AI output enforces non-diagnostic boundaries, highlights missing data ratios, and prevents automated outbreak declarations.

---

## 5. Demonstrated Capabilities vs. Intended Real-World Impact

To ensure complete transparency for evaluators:

### Demonstrated in This Submission (Simulated Environment)
- Full end-to-end software workflow tested with simulated Nigerian community scenarios (*Makoko Waterfront*, *Ajegunle Ward B*, *Ikorodu North*, *Surulere Central*).
- Verified role-based access control, statistical anomaly detection, live server-side Gemini risk synthesis, interactive geographic clustering, and investigation/intervention persistence.

### Intended Real-World Impact (Post-Pilot Deployment Goals)
- **Earlier Field Investigation**: Reduce the time between initial household symptom clusters and CHW water-point inspection.
- **Targeted Water Interventions**: Enable LGA teams to focus chlorination, sampling, and boil-water advisories on specific implicated water points rather than broad, untargeted shutdowns.
- **Stronger Community Trust**: Provide residents with transparent status updates and actionable protective guidance while safeguarding household privacy.

*Note: HealthAlert has not yet undergone live clinical field trials or regulatory certification; all metrics shown in the application are clearly labelled as simulated demonstration data.*

---

## 6. Potential Scalability

- **Configurable Community Onboarding**: Administrators can register any State, LGA, Ward, population estimate, and water source inventory directly in the UI.
- **Multi-Channel Expansion Path**: The structured REST API (`/api/reports`) is designed to integrate future USSD, SMS, or WhatsApp intake gateways for residents without smartphones.
- **Database Migration Readiness**: Collections and role rules are structured cleanly for migration from the current Express datastore to managed cloud databases (such as Cloud Firestore or Cloud SQL) during state-level rollout.
