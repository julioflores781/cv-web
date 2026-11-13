import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  url: string;
  requests: string[];
  /** Headers of each request, in the same order as `requests`. */
  headers: IncomingHttpHeaders[];
  close: () => Promise<void>;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

export async function startServer(handler: Handler): Promise<TestServer> {
  const requests: string[] = [];
  const headers: IncomingHttpHeaders[] = [];
  const server: Server = createServer((req, res) => {
    requests.push(req.url ?? '');
    headers.push(req.headers);
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    headers,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A URL on which nothing listens (the port was just released). */
export async function closedPortUrl(): Promise<string> {
  const server = await startServer((_req, res) => res.end());
  const { url } = server;
  await server.close();
  return url;
}

export function json(res: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
