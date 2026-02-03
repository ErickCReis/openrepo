import { Elysia, t, status } from "elysia";
import { createGitHubClient } from "../lib/github-client";
import { getCookieSchema } from "@api";
import { schema } from "@db";
import { db } from "@db";
import { eq } from "drizzle-orm";

export const githubRouter = new Elysia({ prefix: "/github" })
  .guard({
    cookie: getCookieSchema(),
  })
  .resolve(async ({ cookie }) => {
    const tokenId = cookie.github_token_id.value;
    if (!tokenId) {
      throw status(401, "Not authenticated");
    }

    const [tokenRecord] = await db
      .select({ accessToken: schema.githubTokens.accessToken })
      .from(schema.githubTokens)
      .where(eq(schema.githubTokens.id, tokenId))
      .limit(1);

    if (!tokenRecord) {
      throw status(401, "Token not found");
    }

    return { github: createGitHubClient(tokenRecord.accessToken) };
  })
  .get("/repos", async ({ github }) => {
    return await github.listUserRepos();
  })
  .get("/:owner/repo/:repo", async ({ github, params }) => {
    return await github.getRepo(params.owner, params.repo);
  })
  .get("/:owner/repo/:repo/branches", async ({ github, params }) => {
    return await github.listBranches(params.owner, params.repo);
  })
  .post(
    "/:owner/repo/:repo/branches",
    async ({ github, params, body }) => {
      return await github.createBranch(params.owner, params.repo, body.branchName, body.baseBranch);
    },
    {
      body: t.Object({
        branchName: t.String(),
        baseBranch: t.String(),
      }),
    },
  )
  .post(
    "/:owner/repo/:repo/pulls",
    async ({ github, params, body }) => {
      return await github.createPullRequest(
        params.owner,
        params.repo,
        body.title,
        body.body,
        body.head,
        body.base,
      );
    },
    {
      body: t.Object({
        title: t.String(),
        body: t.String(),
        head: t.String(),
        base: t.String(),
      }),
    },
  )
  .get(
    "/:owner/repo/:repo/pulls",
    async ({ github, params, query }) => {
      return await github.getPullRequests(params.owner, params.repo, query.state || "open");
    },
    {
      query: t.Object({
        state: t.Union([t.Literal("open"), t.Literal("closed"), t.Literal("all")]),
      }),
    },
  );
