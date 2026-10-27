import { PIIPattern } from './types.js';

export function redactString(text: string): string {
  return text
    .replace(
      /(password|secret|token|api[_-]?key|private[_-]?key|access[_-]?token|bearer)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    )
    .replace(/Authorization:\s*\S+/gi, 'Authorization: [REDACTED]')
    .replace(PIIPattern, '[EMAIL_REDACTED]')
    .replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[CARD_REDACTED]');
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
  }
  return value;
}

export function redactValue<T>(value: T): T {
  return redact(value) as T;
}
