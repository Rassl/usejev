export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers },
  });

export async function readJson(request: Request, maxBytes = 8192): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('Request body too large');
  return JSON.parse(text);
}

// Constant-time comparison so the token cannot be guessed byte by byte.
export function tokenMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
