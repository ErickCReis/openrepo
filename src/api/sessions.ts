import { Elysia, t, status } from "elysia";
import { eq } from "drizzle-orm";
import { sessionManager } from "@lib/session-manager";
import { db, schema } from "@db";
import { getCookieSchema } from "@api";
import type { ElysiaWS } from "elysia/ws";

const sessionSockets = new Set<ElysiaWS>();
async function broadcastSessions() {
  const sessions = await sessionManager.listSessions();
  for (const ws of sessionSockets) {
    ws.send(sessions);
  }
}

export const sessionsRouter = new Elysia({ prefix: "/sessions" })
  .ws("/sync/ws", {
    response: t.Array(
      t.Object({
        id: t.String(),
        repo: t.String(),
        branch: t.String(),
        status: t.Enum({ running: "running", stopped: "stopped" }),
        createdAt: t.Date(),
        serverUrl: t.String(),
        port: t.Number(),
      }),
    ),
    open: async (ws) => {
      sessionSockets.add(ws);
      broadcastSessions();
    },
    close: (ws) => {
      sessionSockets.delete(ws);
    },
  })
  .get("/", async () => {
    return await sessionManager.listSessions();
  })
  .get("/:id", async ({ params }) => {
    const session = await sessionManager.getSession(params.id);
    if (!session) {
      throw status(404, "Session not found");
    }
    return session;
  })
  .post(
    "/",
    async ({ body, cookie }) => {
      const tokenId = cookie.github_token_id.value;
      let githubToken: string | undefined;

      if (tokenId) {
        const [tokenRecord] = await db
          .select()
          .from(schema.githubTokens)
          .where(eq(schema.githubTokens.id, tokenId))
          .limit(1);

        if (tokenRecord) {
          githubToken = tokenRecord.accessToken;
        }
      }

      const session = await sessionManager.createSession({
        repo: body.repo,
        branch: body.branch,
      });
      await sessionManager.cloneRepo(session.id, githubToken);
      await sessionManager.startOpenCode(session.id);
      await broadcastSessions();
      return session;
    },
    {
      cookie: getCookieSchema(),
      body: t.Object({
        repo: t.String(),
        branch: t.String(),
      }),
    },
  )
  .post("/:id/start", async ({ params }) => {
    await sessionManager.startOpenCode(params.id);
    await broadcastSessions();
  })
  .post("/:id/stop", async ({ params }) => {
    await sessionManager.stopSession(params.id);
    await broadcastSessions();
  })
  .delete("/:id", async ({ params }) => {
    await sessionManager.deleteSession(params.id);
    await broadcastSessions();
  })
  .get("/:id/files", async ({ params, query }) => {
    return await sessionManager.listFiles(params.id, query.path || ".");
  })
  .get("/:id/files/*", async ({ params }) => {
    const filePath = params["*"];
    const file = await sessionManager.readFile(params.id, filePath);
    const content = await file.text();
    return { content, path: filePath };
  })
  .post(
    "/:id/git",
    async ({ params, body }) => {
      return await sessionManager.runGitCommand(params.id, body.args);
    },
    {
      body: t.Object({
        args: t.Array(t.String()),
      }),
    },
  );
