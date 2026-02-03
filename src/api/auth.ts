import { Elysia, redirect, status } from "elysia";
import { eq } from "drizzle-orm";
import { db, schema } from "@db";
import { getCookieSchema } from "@api";
import { GitHubClient } from "@lib/github-client";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export const authRouter = new Elysia({ prefix: "/auth" })
  .get("/github", () => {
    if (!GITHUB_CLIENT_ID) {
      throw status(
        500,
        "GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      );
    }

    const redirectUrl = new URL("https://github.com/login/oauth/authorize");
    redirectUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
    redirectUrl.searchParams.set("redirect_uri", `${APP_URL}/auth/github/callback`);
    redirectUrl.searchParams.set("scope", "repo read:user");
    redirectUrl.searchParams.set("state", crypto.randomUUID());

    return redirect(redirectUrl.toString());
  })
  .get(
    "/github/callback",
    async ({ query, cookie }) => {
      const { code, error } = query;

      if (error) {
        return redirect(`${APP_URL}/?oauth_error=${encodeURIComponent(error)}`);
      }

      if (!code) {
        return redirect(`${APP_URL}/?oauth_error=no_code`);
      }

      try {
        const github = await GitHubClient.exchangeCodeForToken(
          code,
          GITHUB_CLIENT_ID,
          GITHUB_CLIENT_SECRET,
        );
        const githubUser = await github.getUser();

        const [existingUser] = await db
          .select()
          .from(schema.githubTokens)
          .where(eq(schema.githubTokens.githubUserId, githubUser.id))
          .limit(1);

        let tokenId: string;

        if (existingUser) {
          await db
            .update(schema.githubTokens)
            .set({
              accessToken: github.accessToken,
              username: githubUser.login,
              email: githubUser.email,
            })
            .where(eq(schema.githubTokens.githubUserId, githubUser.id));
          tokenId = existingUser.id;
        } else {
          const [inserted] = await db
            .insert(schema.githubTokens)
            .values({
              githubUserId: githubUser.id,
              username: githubUser.login,
              email: githubUser.email,
              accessToken: github.accessToken,
            })
            .returning();

          if (!inserted) {
            throw status(500, "Failed to save GitHub token");
          }

          tokenId = inserted.id;
        }

        cookie.github_token_id.value = tokenId;

        return redirect(`${APP_URL}/?oauth_success=true`);
      } catch (err) {
        console.error("GitHub OAuth error:", err);
        const message = err instanceof Error ? err.message : "auth_failed";
        return redirect(`${APP_URL}/?oauth_error=${encodeURIComponent(message)}`);
      }
    },
    {
      cookie: getCookieSchema(),
    },
  )
  .get(
    "/github/user",
    async ({ cookie }) => {
      const tokenId = cookie.github_token_id.value;

      if (!tokenId) {
        throw status(401, "Not authenticated");
      }

      const [tokenRecord] = await db
        .select()
        .from(schema.githubTokens)
        .where(eq(schema.githubTokens.id, tokenId))
        .limit(1);

      if (!tokenRecord) {
        throw status(401, "Token not found");
      }

      return {
        id: tokenRecord.githubUserId,
        username: tokenRecord.username,
        email: tokenRecord.email,
      };
    },
    {
      cookie: getCookieSchema(),
    },
  )
  .delete(
    "/github",
    ({ cookie }) => {
      cookie.github_token_id.remove();
    },
    {
      cookie: getCookieSchema(),
    },
  );
