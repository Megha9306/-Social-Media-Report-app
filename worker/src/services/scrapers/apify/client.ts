const APIFY_BASE = 'https://api.apify.com/v2';

/** Retry on transient server errors (5xx) with exponential backoff. */
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  retries = 3,
  baseDelayMs = 1000,
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, opts);
    // Don't retry on success or client errors (4xx) — only on server errors
    if (res.ok || (res.status >= 400 && res.status < 500)) return res;
    if (attempt < retries - 1) {
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  return fetch(url, opts); // final attempt, let caller handle the error
}

interface RunResponse {
  data: {
    id: string;
    defaultDatasetId: string;
    status: string;
  };
}

interface RunStatusResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

export async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  webhookUrl: string,
  webhookSecret?: string,
): Promise<RunResponse['data']> {
  const url = new URL(`${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs`);
  url.searchParams.set('memory', '256');

  // Only register webhook if URL is publicly reachable (not localhost)
  const isPublic = webhookUrl && !webhookUrl.startsWith('http://localhost') && !webhookUrl.startsWith('http://127.');
  if (isPublic) {
    // Embed the shared secret so the handler can authenticate the call
    const secureWebhookUrl = new URL(webhookUrl);
    if (webhookSecret) secureWebhookUrl.searchParams.set('secret', webhookSecret);

    const webhooks = btoa(JSON.stringify([
      {
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
        requestUrl: secureWebhookUrl.toString(),
      },
    ]));
    url.searchParams.set('webhooks', webhooks);
  }

  const res = await fetchWithRetry(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify startActorRun failed (${res.status}): ${text}`);
  }

  const json = await res.json<RunResponse>();
  return json.data;
}

export async function getRunStatus(runId: string, token: string): Promise<RunStatusResponse['data']> {
  const res = await fetchWithRetry(`${APIFY_BASE}/actor-runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Apify getRunStatus failed (${res.status})`);
  }

  const json = await res.json<RunStatusResponse>();
  return json.data;
}

export async function getDatasetItems<T = Record<string, unknown>>(
  datasetId: string,
  token: string
): Promise<T[]> {
  const res = await fetchWithRetry(`${APIFY_BASE}/datasets/${datasetId}/items?format=json&clean=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Apify getDatasetItems failed (${res.status})`);
  }

  return res.json<T[]>();
}

export async function runActorSyncItems<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  memoryMbytes = 256,
  timeoutSecs = 300,
): Promise<T[]> {
  const url = new URL(`${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`);
  url.searchParams.set('token', token);
  url.searchParams.set('memory', String(memoryMbytes));
  url.searchParams.set('timeout', String(timeoutSecs));

  const res = await fetchWithRetry(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify runActorSyncItems failed (${res.status}): ${text}`);
  }

  return res.json<T[]>();
}
