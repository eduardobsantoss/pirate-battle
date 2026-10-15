import { OPTION_LIMITS, type PlayerOptions } from '../../game/config';

type Field = keyof PlayerOptions;

export const LIMITS: Record<Field, { min: number; max: number; step: number }> = {
  sessionDurationSec: OPTION_LIMITS.sessionDurationSec,
  spawnIntervalSec: OPTION_LIMITS.spawnIntervalSec,
};

export function validateOption(key: Field, raw: string): string | null {
  const { min, max, step } = LIMITS[key];
  if (raw.trim() === '') return 'This field is required.';
  const value = Number(raw);
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (value < min || value > max) return `Must be between ${min} and ${max}.`;
  const steps = (value - min) / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) return `Must be a multiple of ${step}.`;
  return null;
}
