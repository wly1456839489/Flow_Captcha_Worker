/**
 * Proxy route for /api/v1/sessions/:sessionId/error and /finish
 * These also need no short timeout since they're fire-and-forget to the worker.
 */

export const maxDuration = 30;

const WORKER_BASE = 'http://127.0.0.1:9060';

async function proxyToWorker(req: Request, sessionId: string, action: string) {
  const auth = req.headers.get('authorization') || '';
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const resp = await fetch(`${WORKER_BASE}/api/v1/sessions/${sessionId}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return Response.json(data, { status: resp.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ detail: msg }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  // Determine action from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const action = pathParts[pathParts.length - 1]; // 'error' or 'finish'
  
  return proxyToWorker(req, sessionId, action);
}
