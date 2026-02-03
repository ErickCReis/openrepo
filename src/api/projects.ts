import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@db";

export const projectsRouter = new Elysia()
  .get("/api/projects", async () => {
    return await db.select().from(schema.projects).orderBy(asc(schema.projects.createdAt));
  })
  .post(
    "/api/projects",
    async ({ body }) => {
      const [result] = await db
        .insert(schema.projects)
        .values({
          name: body.name,
          repo: body.repo,
          defaultBranch: body.defaultBranch,
          createdAt: new Date(),
        })
        .returning();

      if (!result) {
        throw new Error("Failed to create project");
      }

      return result;
    },
    {
      body: t.Object({
        name: t.String(),
        repo: t.String(),
        defaultBranch: t.String(),
      }),
    },
  )
  .delete("/api/projects/:id", async ({ params }) => {
    await db.delete(schema.projects).where(eq(schema.projects.id, params.id));
  });
