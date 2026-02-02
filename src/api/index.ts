import { Elysia, t } from "elysia";
import { sessionsRouter } from "./sessions";
import { githubRouter } from "./github";
import { authRouter } from "./auth";

export function getCookieSchema() {
  return t.Cookie({
    github_token_id: t.Optional(t.String())
  })
};

export const apiRouter = new Elysia()
  .use(sessionsRouter)
  .use(githubRouter)
  .use(authRouter);

export type ApiRouter = typeof apiRouter;