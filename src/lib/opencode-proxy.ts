import { status } from "elysia";
import { sessionManager } from "./session-manager";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function buildProxyRequestHeaders(headers: Headers, port: number): Headers {
  const next = new Headers(headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    next.delete(header);
  }
  next.delete("content-length");
  next.set("host", `127.0.0.1:${port}`);
  return next;
}

function buildProxyResponseHeaders(headers: Headers): Headers {
  const next = new Headers(headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    next.delete(header);
  }
  return next;
}

function rewriteOpenCodeHtml(html: string, sessionId: string) {
  const prefix = `/opencode/${sessionId}`;
  const rewritten = html
    .replaceAll('href="/', `href="${prefix}/`)
    .replaceAll('src="/', `src="${prefix}/`)
    .replaceAll('content="/', `content="${prefix}/`);

  const bootstrap = `<script src="${prefix}/openrepo-bootstrap.js"></script>`;
  return rewritten.replace("<head>", `<head>${bootstrap}`);
}

export async function proxySessionRequest(
  request: Request,
  sessionId: string,
  upstreamPathname: string,
) {
  const method = request.method.toUpperCase();
  const incoming = new URL(request.url);
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let session = await sessionManager.getSession(sessionId);
  if (!session) {
    throw status(404, "Session not found");
  }

  if (session.status !== "running") {
    await sessionManager.startOpenCode(sessionId);
    session = await sessionManager.getSession(sessionId);
    if (!session) {
      throw status(404, "Session not found");
    }
  }

  const runProxyFetch = async (port: number) => {
    const target = new URL(incoming);
    target.protocol = "http:";
    target.hostname = "127.0.0.1";
    target.port = String(port);
    target.pathname = upstreamPathname.startsWith("/") ? upstreamPathname : `/${upstreamPathname}`;

    const headers = buildProxyRequestHeaders(request.headers, port);
    return await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
    });
  };

  try {
    const response = await runProxyFetch(session.port);
    const responseHeaders = buildProxyResponseHeaders(response.headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    // Session state can drift after process restarts; attempt one automatic recovery.
    await sessionManager.stopSession(sessionId).catch(() => undefined);
    await sessionManager.startOpenCode(sessionId);
    const refreshed = await sessionManager.getSession(sessionId);
    if (!refreshed) {
      throw status(404, "Session not found");
    }

    const response = await runProxyFetch(refreshed.port);
    const responseHeaders = buildProxyResponseHeaders(response.headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }
}

export async function proxySessionWebRequest(
  request: Request,
  sessionId: string,
  upstreamPathname: string,
) {
  const response = await proxySessionRequest(request, sessionId, upstreamPathname);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) {
    return response;
  }

  const html = await response.text();
  const rewritten = rewriteOpenCodeHtml(html, sessionId);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");

  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
