/**
 * Proxy route for /api/v1/solve
 * This API Route takes priority over next.config.ts rewrites,
 * and allows us to set a long timeout without Next.js's rewrite proxy cutting the connection.
 */

export const maxDuration = 300; // 5 minutes — enough for any token generation cycle

const WORKER_BASE = 'http://127.0.0.1:9060';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const resp = await fetch(`${WORKER_BASE}/api/v1/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
      // @ts-ignore — Node 18+ fetch supports signal
      signal: AbortSignal.timeout(295000),
    });

    const data = await resp.json();
    return Response.json(data, { status: resp.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ detail: msg }, { status: 500 });
  }
}
