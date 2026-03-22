export const MAX_AGE = 120;

export function clampAge(value: number, fallback: number, min = 18, max = MAX_AGE): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}