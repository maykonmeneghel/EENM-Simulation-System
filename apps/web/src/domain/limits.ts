import { MAX_DURATION_MS, MAX_UNITS_PER_TYPE, MIN_DURATION_MS } from './defaults';

/**
 * The limits the server enforces on a request (`GET /api/v1/limits`, docs/deployment.md). A hosted server narrows
 * the contract ranges to bound the cost of a run; the form checks them before submitting, the API stays the authority.
 */
export interface ServerLimits {
  minDurationMs: number;
  maxDurationMs: number;
  minStepMs: number;
  maxStepMs: number;
  maxFrequencyHz: number;
  maxUnitsPerType: number;
  maxTotalUnits: number;
  /** Samples per streamed series (`durationMs / outputStepMs`); null = no cap. */
  maxOutputPoints: number | null;
  maxUnitEventsDurationMs: number;
}

/** The contract ranges (docs/contracts.md §1): what a server without configured limits accepts. */
export const CONTRACT_LIMITS: ServerLimits = {
  minDurationMs: MIN_DURATION_MS,
  maxDurationMs: MAX_DURATION_MS,
  minStepMs: 0.005,
  maxStepMs: 0.1,
  maxFrequencyHz: 200,
  maxUnitsPerType: MAX_UNITS_PER_TYPE,
  maxTotalUnits: 3 * MAX_UNITS_PER_TYPE,
  maxOutputPoints: null,
  maxUnitEventsDurationMs: 30_000,
};

const NUMBER_FIELDS = [
  'minDurationMs',
  'maxDurationMs',
  'minStepMs',
  'maxStepMs',
  'maxFrequencyHz',
  'maxUnitsPerType',
  'maxTotalUnits',
  'maxUnitEventsDurationMs',
] as const;

/** The server's answer, field by field; anything missing or malformed keeps the contract value. */
export function parseLimits(body: unknown): ServerLimits {
  if (typeof body !== 'object' || body === null) return CONTRACT_LIMITS;
  const raw = body as Record<string, unknown>;
  const out: ServerLimits = { ...CONTRACT_LIMITS };
  for (const key of NUMBER_FIELDS) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[key] = v;
  }
  const points = raw.maxOutputPoints;
  out.maxOutputPoints = typeof points === 'number' && Number.isFinite(points) && points > 0 ? points : null;
  return out;
}

/** True when the server narrows the contract's duration (the form then says so next to the field). */
export function limitsDuration(limits: ServerLimits): boolean {
  return limits.maxDurationMs < CONTRACT_LIMITS.maxDurationMs;
}
