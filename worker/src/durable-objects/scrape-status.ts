export interface ScrapeEvent {
  type: 'scraping' | 'completed' | 'failed';
  postIds: string[];
  data?: Record<string, unknown>;
  timestamp: string;
}

export class ScrapeStatusDO implements DurableObject {
  private connections: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.connections.add(server);

    server.addEventListener('close', () => {
      this.connections.delete(server);
    });

    server.addEventListener('error', () => {
      this.connections.delete(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  broadcast(event: ScrapeEvent): void {
    const message = JSON.stringify(event);
    const dead: WebSocket[] = [];

    for (const ws of this.connections) {
      try {
        ws.send(message);
      } catch {
        dead.push(ws);
      }
    }

    for (const ws of dead) {
      this.connections.delete(ws);
    }
  }
}
