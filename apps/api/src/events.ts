import type { ServerResponse } from 'node:http';

export interface RunEventPayload {
  runId: string;
  type: 'stage' | 'lane' | 'log' | 'circuit' | 'status' | 'gate';
  data: Record<string, unknown>;
  timestamp: string;
}

export class EventStreamManager {
  private readonly subscribers = new Map<string, Set<ServerResponse>>();

  subscribe(runId: string, res: ServerResponse): () => void {
    let clients = this.subscribers.get(runId);
    if (!clients) {
      clients = new Set();
      this.subscribers.set(runId, clients);
    }
    clients.add(res);

    // Initial SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send connection established event
    this.send(res, 'connected', { runId, timestamp: new Date().toISOString() });

    const cleanup = () => {
      const current = this.subscribers.get(runId);
      if (current) {
        current.delete(res);
        if (current.size === 0) {
          this.subscribers.delete(runId);
        }
      }
    };

    res.on('close', cleanup);
    return cleanup;
  }

  broadcast(runId: string, event: string, data: Record<string, unknown>): void {
    const clients = this.subscribers.get(runId);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
      try {
        this.send(res, event, data);
      } catch {
        clients.delete(res);
      }
    }
  }

  private send(res: ServerResponse, event: string, data: Record<string, unknown>): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  hasSubscribers(runId: string): boolean {
    const clients = this.subscribers.get(runId);
    return Boolean(clients && clients.size > 0);
  }
}

export const defaultEventStream = new EventStreamManager();
