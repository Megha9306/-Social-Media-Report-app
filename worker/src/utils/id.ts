// Cloudflare Workers compatible nanoid using crypto.randomUUID
export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 21);
}
