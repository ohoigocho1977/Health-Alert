import { GoogleGenAI, Type } from '@google/genai';
import type {
  CommunityDetectionResult,
  FieldVerification,
  HealthReport,
  RiskAssessment,
  ThresholdConfig,
} from '../src/shared/types.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface GeminiAssessmentPayload {
  executiveSummary: string;
  patternExplanation: string;
  riskLevel: 'low' | 'elevated' | 'high';
  recommendedPriorities: string[];
  uncertaintyStatement: string;
  traceableReportIds: string[];
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('resource_exhausted') ||
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed')
  );
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxRetries = 2
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isTransientGeminiError(err)) {
        const delayMs = 600 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function generateCommunityRiskAssessment(params: {
  detection: CommunityDetectionResult;
  recentReports: HealthReport[];
  verifications: FieldVerification[];
  thresholdConfig: ThresholdConfig;
  actorUid: string;
}): Promise<RiskAssessment> {
  const { detection, recentReports, verifications, thresholdConfig, actorUid } = params;
  const ai = getGeminiClient();

  const anonymizedReports = recentReports.slice(0, 35).map((r) => ({
    reportId: r.id,
    symptoms: r.symptoms,
    severity: r.severity,
    affectedCount: r.affectedCount,
    ageGroup: r.ageGroup,
    suspectedWaterSource: r.suspectedWaterSourceLabel || null,
    verificationStatus: r.verificationStatus,
    isSimulated: r.isSimulated,
    createdAt: r.createdAt,
  }));

  const verificationSummary = verifications.slice(0, 15).map((v) => ({
    reportId: v.reportId,
    outcome: v.outcome,
    waterSampleTaken: v.waterSampleTaken,
    householdsVisited: v.householdsVisited,
    clinicalNotes: v.clinicalNotes,
    createdAt: v.createdAt,
  }));

  const structuredEvidence = {
    communityId: detection.communityId,
    communityName: detection.communityName,
    recentReportCount: detection.recentReportCount,
    recentAffectedPeople: detection.recentAffectedPeople,
    baselineDailyMean: detection.baselineDailyMean,
    currentDailyRate: detection.currentDailyRate,
    volumeMultiplier: detection.volumeMultiplier,
    zScore: detection.zScore,
    peerMedianDailyRate: detection.peerMedianDailyRate,
    verifiedCount: detection.verifiedCount,
    pendingCount: detection.pendingCount,
    suggestedClassification: detection.suggestedClassification,
    signals: detection.signals,
    anonymizedReports,
    fieldVerifications: verificationSummary,
  };

  const systemInstruction = `You are a public health surveillance intelligence analyst supporting HealthAlert in Nigeria.
CRITICAL GUARDRAILS:
1. You NEVER diagnose individual patients and NEVER declare an official disease outbreak.
2. Base every statement strictly on the provided deterministic statistical metrics, anonymized report IDs, and field verification records.
3. Explicitly state uncertainty, potential reporting biases, and the distinction between unverified reports, statistical anomalies, and human-verified incidents.
4. Keep language clear, objective, operational, and actionable for Community Health Workers and Health Administrators.
5. Cite specific report IDs and exact metric values from the input JSON so every claim is traceable.`;

  const prompt = `Analyze the following community health surveillance snapshot and statistical detection output for ${detection.communityName}.
Return a structured JSON risk assessment explaining why this community does or does not require field attention, prioritizing investigation steps, and stating uncertainties clearly.

SURVEILLANCE_DATA_JSON:
${JSON.stringify(structuredEvidence, null, 2)}`;

  const response = await generateWithRetry(ai, {
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: 'Concise 2-3 sentence situation summary referencing observed volume vs baseline and verification state.',
          },
          patternExplanation: {
            type: Type.STRING,
            description: 'Detailed explanation of statistical signals, temporal trend, symptom mix, and water source convergence citing report IDs.',
          },
          riskLevel: {
            type: Type.STRING,
            description: 'Operational attention level: low, elevated, or high. Never declare an outbreak.',
          },
          recommendedPriorities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3 to 5 concrete, prioritized field verification or public health response actions.',
          },
          uncertaintyStatement: {
            type: Type.STRING,
            description: 'Explicit statement of data gaps, unverified report ratios, sample size limits, and non-diagnostic boundaries.',
          },
          traceableReportIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exact report IDs from SURVEILLANCE_DATA_JSON referenced in this analysis.',
          },
        },
        required: [
          'executiveSummary',
          'patternExplanation',
          'riskLevel',
          'recommendedPriorities',
          'uncertaintyStatement',
          'traceableReportIds',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: GeminiAssessmentPayload;
  try {
    parsed = JSON.parse(rawText) as GeminiAssessmentPayload;
  } catch {
    throw new Error('Gemini returned malformed JSON. Please retry the analysis.');
  }

  const normalizedRisk: 'low' | 'elevated' | 'high' =
    parsed.riskLevel === 'high' || parsed.riskLevel === 'elevated' ? parsed.riskLevel : 'low';

  const validReportIdSet = new Set(recentReports.map((r) => r.id));
  const citedIds = (parsed.traceableReportIds || []).filter((id) => validReportIdSet.has(id));

  return {
    id: `ra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    communityId: detection.communityId,
    communityName: detection.communityName,
    generatedBy: 'gemini_ai',
    statusClassification: detection.suggestedClassification,
    statisticalSignals: detection.signals,
    thresholdConfigSnapshot: { ...thresholdConfig },
    aiSummary: parsed.executiveSummary,
    patternExplanation: parsed.patternExplanation,
    riskLevel: normalizedRisk,
    recommendedPriorities: parsed.recommendedPriorities?.slice(0, 6) ?? [],
    uncertaintyStatement: parsed.uncertaintyStatement,
    limitations: detection.limitations,
    traceableReportIds: citedIds.length > 0 ? citedIds : detection.traceableReportIds,
    createdByUid: actorUid,
    createdAt: new Date().toISOString(),
  };
}
