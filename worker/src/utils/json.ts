/**
 * Safely parses a JSON string. Returns `fallback` if the value is null,
 * empty, or contains invalid JSON rather than throwing.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
