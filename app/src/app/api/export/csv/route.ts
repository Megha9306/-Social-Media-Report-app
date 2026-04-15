import { NextRequest } from 'next/server';

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? 'http://localhost:8787';

/**
 * GET /api/export/csv?platform=...&campaign=...&month=...
 * Proxies to the CF Worker which generates and streams CSV directly.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  const res = await fetch(`${WORKER_URL}/api/export/csv?${params}`);

  if (!res.ok) {
    return new Response('Export failed', { status: res.status });
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': res.headers.get('Content-Disposition') ?? 'attachment; filename="report.csv"',
    },
  });
}
