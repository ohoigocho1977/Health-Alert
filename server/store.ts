import fs from 'node:fs';
import path from 'node:path';
import type { AuditLog, Community, UserRole } from '../src/shared/types.ts';
import { createSeedDatabase, type DatabaseState } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'healthalert-db.json');

let state: DatabaseState | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase(): DatabaseState {
  if (state) return state;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      state = JSON.parse(raw) as DatabaseState;
      return state;
    } catch {
      // Fall back to fresh seed if file is corrupted
    }
  }
  state = createSeedDatabase();
  saveDatabase(state);
  return state;
}

export function saveDatabase(nextState: DatabaseState): void {
  state = nextState;
  ensureDir();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function resetDemoDatabase(): DatabaseState {
  const fresh = createSeedDatabase();
  saveDatabase(fresh);
  return fresh;
}

/**
 * Applies privacy-preserving coordinate jitter (300m–550m) within the community area
 * so no exact household coordinates are ever stored or plotted publicly.
 */
export function computePrivacyFuzzedCoordinates(
  community: Community,
  waterSourceId?: string
): { approxLat: number; approxLng: number } {
  let anchorLat = community.centerLat;
  let anchorLng = community.centerLng;

  if (waterSourceId) {
    const ws = community.waterSources.find((w) => w.id === waterSourceId);
    if (ws) {
      anchorLat = ws.lat;
      anchorLng = ws.lng;
    }
  }

  // Random angle & 300m-550m radius offset (~0.0027 to ~0.0050 degrees)
  const angle = Math.random() * Math.PI * 2;
  const distMeters = 300 + Math.random() * 250;
  const dLat = (distMeters * Math.cos(angle)) / 111320;
  const dLng = (distMeters * Math.sin(angle)) / (111320 * Math.cos((anchorLat * Math.PI) / 180));

  return {
    approxLat: Number((anchorLat + dLat).toFixed(5)),
    approxLng: Number((anchorLng + dLng).toFixed(5)),
  };
}

export function recordAuditLog(
  db: DatabaseState,
  params: {
    actorUid: string;
    actorRole: UserRole;
    actorEmail: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string;
  }
): void {
  const entry: AuditLog = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    actorEmail: params.actorEmail,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}
