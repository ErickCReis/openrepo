import { Elysia, status } from "elysia";
import { eq } from "drizzle-orm";
import index from "./index.html";
import { db, schema } from "./db";
import { apiRouter } from "./api";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

migrate(db, { migrationsFolder: "src/db/migrations" });

const app = new Elysia({
  cookie: { secrets: process.env.COOKIE_SECRET || "change-this-in-production" },
})
  .get("/", index)
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
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

console.log(`🚀 OpenCode Manager running at ${app.server?.url}`);
