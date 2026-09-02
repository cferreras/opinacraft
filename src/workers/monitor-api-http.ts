import type { IncomingMessage, ServerResponse } from "node:http";

import { isAuthorizedMonitorRequest } from "@/lib/monitor/api";

// Every Monitor API payload is a small JSON document (the largest is a batch of
// 1,000 server IDs). Anything beyond this bound is refused while streaming so a
// caller can never make the process allocate an unbounded buffer.
export const MAX_REQUEST_BODY_BYTES = 256 * 1024;
export const REQUEST_TIMEOUT_MS = 30_000;

class MonitorRequestRejection extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MonitorRequestRejection";
    this.status = status;
  }
}

function requestPathname(request: IncomingMessage) {
  return (request.url ?? "/").split("?", 1)[0];
}

function hasRequestBody(request: IncomingMessage) {
  const declared = Number(request.headers["content-length"]);
  return Boolean(request.headers["transfer-encoding"]) || (Number.isFinite(declared) && declared > 0);
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_REQUEST_BODY_BYTES) throw new MonitorRequestRejection(413, "Request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function requestFromNode(request: IncomingMessage) {
  const method = request.method ?? "GET";
  const expectsBody = method !== "GET" && method !== "HEAD";
  if (!expectsBody && hasRequestBody(request)) {
    throw new MonitorRequestRejection(400, `${method} requests must not carry a body.`);
  }
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new MonitorRequestRejection(413, "Request body is too large.");
  }
  const body = expectsBody ? await readRequestBody(request) : undefined;
  return new Request(`http://${request.headers.host ?? "127.0.0.1"}${request.url ?? "/"}`, {
    method,
    headers: Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => value ? [[key, Array.isArray(value) ? value.join(",") : value]] : [])),
    body,
    ...(body ? { duplex: "half" as const } : {}),
  });
}

/**
 * Bearer authentication runs against the raw IncomingMessage, before a single
 * body byte is buffered, so an unauthenticated caller cannot make this process
 * allocate memory on its behalf. Refused requests close their connection with
 * their body still unread.
 */
export function createMonitorApiNodeListener({
  secret,
  handler,
}: {
  secret: string | undefined;
  handler: (request: Request) => Promise<Response>;
}) {
  return async function monitorApiNodeListener(request: IncomingMessage, response: ServerResponse) {
    const refuse = (status: number, error: string) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("connection", "close");
      response.end(JSON.stringify({ error }));
    };
    request.setTimeout(REQUEST_TIMEOUT_MS, () => refuse(408, "Request timed out."));
    try {
      const isHealthCheck = request.method === "GET" && requestPathname(request) === "/healthz";
      if (!isHealthCheck && !isAuthorizedMonitorRequest(request.headers.authorization, secret)) {
        refuse(401, "Unauthorized");
        return;
      }
      const result = await handler(await requestFromNode(request));
      response.statusCode = result.status;
      result.headers.forEach((value, key) => response.setHeader(key, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      if (error instanceof MonitorRequestRejection) {
        refuse(error.status, error.message);
        return;
      }
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Monitor API failed." }));
    }
  };
}
