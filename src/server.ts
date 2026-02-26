import { Elysia, status } from "elysia";
import { eq } from "drizzle-orm";
import { resolve } from "path";
import index from "./index.html";
import { db, schema } from "./db";
import { apiRouter } from "./api";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { sessionManager } from "./lib/session-manager";
import { proxySessionWebRequest } from "./lib/opencode-proxy";

migrate(db, { migrationsFolder: "src/db/migrations" });
const SESSIONS_DIR = resolve(process.env.SESSIONS_DIR || "./sessions");

function getSessionRepoDir(sessionId: string) {
  return `${SESSIONS_DIR}/${sessionId}/repo`;
}

function encodeDirectoryPath(directory: string) {
  return Buffer.from(directory).toString("base64url");
}

function decodeDirectoryPath(encodedDirectory: string) {
  try {
    return Buffer.from(encodedDirectory, "base64url").toString();
  } catch {
    return null;
  }
}

function getSessionIdFromEncodedDirectory(encodedDirectory: string) {
  const directory = decodeDirectoryPath(encodedDirectory);
  if (!directory) {
    return null;
  }

  const prefix = `${SESSIONS_DIR}/`;
  if (!directory.startsWith(prefix) || !directory.endsWith("/repo")) {
    return null;
  }

  const sessionId = directory.slice(prefix.length, -"/repo".length);
  if (!sessionId || sessionId.includes("/")) {
    return null;
  }

  return sessionId;
}

async function getOrCreateOpencodeSession(directory: string): Promise<string> {
  const port = sessionManager.getOpenCodePort();
  const listUrl = new URL(`http://127.0.0.1:${port}/session`);
  listUrl.searchParams.set("directory", directory);

  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) {
    throw new Error(`Failed to list OpenCode sessions: ${listResponse.status}`);
  }

  const existing = (await listResponse.json()) as Array<{
    id: string;
    time?: { updated?: number; created?: number };
  }>;

  const recentSession = existing
    .slice()
    .sort(
      (a, b) =>
        (b.time?.updated || b.time?.created || 0) - (a.time?.updated || a.time?.created || 0),
    )[0];

  if (recentSession?.id) {
    return recentSession.id;
  }

  const createUrl = new URL(`http://127.0.0.1:${port}/session`);
  createUrl.searchParams.set("directory", directory);

  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "OpenRepo Session" }),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create OpenCode session: ${createResponse.status}`);
  }

  const created = (await createResponse.json()) as { id?: string };
  if (!created.id) {
    throw new Error("OpenCode session creation returned no id");
  }
  return created.id;
}

async function resolveOpencodeSessionPath(sessionId: string) {
  const session = await sessionManager.getSession(sessionId);
  if (!session) {
    throw status(404, "Session not found");
  }
  if (session.status !== "running") {
    await sessionManager.startOpenCode(sessionId);
  }

  const started = await sessionManager.getSession(sessionId);
  if (!started) {
    throw status(404, "Session not found");
  }

  const repoDir = getSessionRepoDir(sessionId);
  const opencodeSessionId = await getOrCreateOpencodeSession(repoDir);
  const encodedDir = encodeDirectoryPath(repoDir);
  return `/${encodedDir}/session/${opencodeSessionId}`;
}

async function proxyEncodedSessionRoute(
  request: Request,
  encodedDirectory: string,
  upstreamPathname: string,
) {
  const sessionId = getSessionIdFromEncodedDirectory(encodedDirectory);
  if (!sessionId) {
    throw status(404, "Session not found");
  }

  const session = await sessionManager.getSession(sessionId);
  if (!session) {
    throw status(404, "Session not found");
  }

  return await proxySessionWebRequest(request, sessionId, upstreamPathname);
}

await db
  .update(schema.sessions)
  .set({ status: "stopped" })
  .where(eq(schema.sessions.status, "running"));

const app = new Elysia({
  cookie: { secrets: process.env.COOKIE_SECRET || "change-this-in-production" },
})
  .get("/", index)
  .get("/opencode/:id/openrepo-bootstrap.js", ({ params }) => {
    const content =
      `localStorage.setItem("opencode.settings.dat:defaultServerUrl",` +
      `window.location.origin + "/api/sessions/${params.id}/proxy");`;
    return new Response(content, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  })
  .all("/opencode/:id", async ({ params, request }) => {
    const upstreamPath = await resolveOpencodeSessionPath(params.id);
    const current = new URL(request.url);
    return Response.redirect(`${upstreamPath}${current.search}`, 302);
  })
  .all("/opencode/:id/*", async ({ params, request }) => {
    const path = params["*"] || "";
    if (path === "" || path === "/") {
      const upstreamPath = await resolveOpencodeSessionPath(params.id);
      const current = new URL(request.url);
      return Response.redirect(`${upstreamPath}${current.search}`, 302);
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return await proxySessionWebRequest(request, params.id, normalizedPath);
  })
  .all("/:encoded/session", async ({ params, request }) => {
    return await proxyEncodedSessionRoute(request, params.encoded, `/${params.encoded}/session`);
  })
  .all("/:encoded/session/:opencodeSessionId", async ({ params, request }) => {
    return await proxyEncodedSessionRoute(
      request,
      params.encoded,
      `/${params.encoded}/session/${params.opencodeSessionId}`,
    );
  })
  .use(apiRouter)
  .all("*", () => status(404))
  .onError(({ code, error }) => {
    console.error(`Error ${code}:`, error);
    const statusCode = code === "VALIDATION" ? 400 : 500;
    const message = error instanceof Error ? error.message : "Internal Error";
    return new Response(message, { status: statusCode });
  })
  .listen({ port: 3000 });

const gracefulShutdown = async () => {
  console.log("\nShutting down...");
  await db
    .update(schema.sessions)
    .set({ status: "stopped" })
    .where(eq(schema.sessions.status, "running"));
  await sessionManager.shutdownOpenCodeServer();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

console.log(`🚀 OpenRepo running at ${app.server?.url}`);
