import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { sessionManager } from "@lib/session-manager";
import { db, schema } from "@db";
import { getCookieSchema } from "@api";

export const sessionsRouter = new Elysia()
  .get("/api/sessions", async () => {
    return await sessionManager.listSessions();
  })
  .get("/api/sessions/:id", async ({ params, error }) => {
    const session = await sessionManager.getSession(params.id);
    if (!session) {
      return error(404, "Session not found");
    }
    return session;
  })
  .post(
    "/api/sessions",
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
  .post("/api/sessions/:id/start", async ({ params }) => {
    await sessionManager.startOpenCode(params.id);
  })
  .post("/api/sessions/:id/stop", async ({ params }) => {
    await sessionManager.stopSession(params.id);
  })
  .delete("/api/sessions/:id", async ({ params }) => {
    await sessionManager.deleteSession(params.id);
  })
  .get("/api/sessions/:id/files", async ({ params, query }) => {
    return await sessionManager.listFiles(params.id, query.path || ".");
  })
  .get("/api/sessions/:id/files/*", async ({ params }) => {
    const filePath = params["*"];
    const file = await sessionManager.readFile(params.id, filePath);
    const content = await file.text();
    return { content, path: filePath };
  })
  .post(
    "/api/sessions/:id/git",
    async ({ params, body }) => {
      return await sessionManager.runGitCommand(params.id, body.args);
    },
    {
      body: t.Object({
        args: t.Array(t.String()),
      }),
    },
  );
