import { isValidDateKey } from '../../utils/date';

export type UnknownRecord = Record<string, unknown>;

export class AppDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppDataValidationError';
  }
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new AppDataValidationError(`${label} 형식이 올바르지 않아요.`);
  }
  return value;
}

export function requiredString(
  value: unknown,
  label: string,
  maxLength = 200,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new AppDataValidationError(`${label} 값이 올바르지 않아요.`);
  }
  return value;
}

export function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AppDataValidationError(`${label} 값이 올바르지 않아요.`);
  }
  return value;
}

export function integerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new AppDataValidationError(`${label} 값이 올바르지 않아요.`);
  }
  return value as number;
}

export function nullableMinutes(value: unknown, label: string): number | null {
  if (value === null) return null;
  return integerInRange(value, label, 0, 24 * 60 - 1);
}

export function dateKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isValidDateKey(value)) {
    throw new AppDataValidationError(`${label} 날짜가 올바르지 않아요.`);
  }
  return value;
}

export function nullableIsoDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new AppDataValidationError(`${label} 날짜가 올바르지 않아요.`);
  }
  return value;
}
