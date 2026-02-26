import { $ } from "bun";
import { mkdir } from "fs/promises";
import { eq, asc } from "drizzle-orm";
import { resolve } from "path";
import { createOpencode } from "@opencode-ai/sdk";
import { db, schema } from "../db";
import { generateSessionSlug } from "./utils";

const SESSIONS_DIR = resolve(process.env.SESSIONS_DIR || "./sessions");
const parsedSharedPort = Number.parseInt(process.env.OPENCODE_PORT || "4096", 10);
const SHARED_OPENCODE_PORT = Number.isFinite(parsedSharedPort) ? parsedSharedPort : 4096;

let sharedServerController: AbortController | null = null;
let sharedServerStarted = false;
let sharedServerStarting: Promise<void> | null = null;

function stopManagedSharedServer() {
  if (sharedServerController) {
    sharedServerController.abort();
    sharedServerController = null;
  }

  sharedServerStarted = false;
  sharedServerStarting = null;
}

async function isSharedServerReachable() {
  try {
    const response = await fetch(`http://127.0.0.1:${SHARED_OPENCODE_PORT}/session`);
    return response.ok;
  } catch {
    return false;
  }
}

export interface CreateSessionInput {
  repo: string;
  branch: string;
}

export class SessionManager {
  private async writeSessionConfig(sessionId: string) {
    const sessionDir = `${SESSIONS_DIR}/${sessionId}`;
    await Bun.write(
      `${sessionDir}/opencode.json`,
      JSON.stringify(
        {
          server: {
            port: SHARED_OPENCODE_PORT,
            hostname: "127.0.0.1",
          },
        },
        null,
        2,
      ),
    );
  }

  private async ensureSharedOpenCodeServer() {
    if (sharedServerStarted && !(await isSharedServerReachable())) {
      stopManagedSharedServer();
    }

    if (!sharedServerStarted && (await isSharedServerReachable())) {
      sharedServerStarted = true;
      return;
    }

    if (sharedServerStarting) {
      await sharedServerStarting;
      return;
    }

    sharedServerStarting = (async () => {
      const controller = new AbortController();
      sharedServerController = controller;

      try {
        await createOpencode({
          port: SHARED_OPENCODE_PORT,
          hostname: "127.0.0.1",
          signal: controller.signal,
        });
        sharedServerStarted = true;
      } catch (error) {
        if (sharedServerController === controller) {
          sharedServerController = null;
        }
        sharedServerStarted = false;
        throw error;
      } finally {
        sharedServerStarting = null;
      }
    })();

    await sharedServerStarting;
  }

  getOpenCodePort() {
    return SHARED_OPENCODE_PORT;
  }

  async restartOpenCodeServer() {
    stopManagedSharedServer();
    await this.ensureSharedOpenCodeServer();
  }

  async shutdownOpenCodeServer() {
    stopManagedSharedServer();
  }

  async createSession(input: CreateSessionInput) {
    const id = generateSessionSlug(input.repo, input.branch);
    const sessionDir = `${SESSIONS_DIR}/${id}`;

    await mkdir(sessionDir, { recursive: true });
    await this.writeSessionConfig(id);

    const [result] = await db
      .insert(schema.sessions)
      .values({
        id,
        repo: input.repo,
        branch: input.branch,
        port: SHARED_OPENCODE_PORT,
        status: "stopped",
        createdAt: new Date(),
      })
      .returning();

    if (!result) {
      throw new Error("Failed to create session");
    }

    return {
      id: result.id,
      repo: result.repo,
      branch: result.branch,
      port: result.port,
      status: result.status,
      createdAt: result.createdAt,
    };
  }

  async cloneRepo(sessionId: string, githubToken?: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`;

    try {
      const authUrl = githubToken
        ? `https://${githubToken}@github.com/${session.repo}`
        : `https://github.com/${session.repo}`;

      await $`git clone --depth 1 -b ${session.branch} ${authUrl} ${sessionDir}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Git clone failed: ${message}`);
    }
  }

  async startOpenCode(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    await this.writeSessionConfig(sessionId);
    await this.ensureSharedOpenCodeServer();

    await db
      .update(schema.sessions)
      .set({ status: "running", port: SHARED_OPENCODE_PORT })
      .where(eq(schema.sessions.id, sessionId));
  }

  async stopSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    await db
      .update(schema.sessions)
      .set({ status: "stopped" })
      .where(eq(schema.sessions.id, sessionId));

    const running = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.status, "running"))
      .limit(1);

    if (running.length === 0) {
      stopManagedSharedServer();
    }
  }

  async deleteSession(sessionId: string) {
    await this.stopSession(sessionId);

    const sessionDir = `${SESSIONS_DIR}/${sessionId}`;
    try {
      await $`rm -rf ${sessionDir}`.nothrow().quiet();
    } catch {}

    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  }

  async getSession(sessionId: string) {
    const [result] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));

    if (!result) return null;

    return {
      id: result.id,
      repo: result.repo,
      branch: result.branch,
      port: result.port,
      status: result.status,
      createdAt: result.createdAt,
      serverUrl: `/opencode/${result.id}`,
    };
  }

  async listSessions() {
    const results = await db.select().from(schema.sessions).orderBy(asc(schema.sessions.createdAt));

    return results.map((r) => ({
      id: r.id,
      repo: r.repo,
      branch: r.branch,
      port: r.port,
      status: r.status,
      createdAt: r.createdAt,
      serverUrl: `/opencode/${r.id}`,
    }));
  }

  async getSessionPort(sessionId: string): Promise<number | null> {
    const session = await this.getSession(sessionId);
    return session?.port ?? null;
  }

  async runGitCommand(sessionId: string, args: string[]): Promise<string> {
    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`;
    const process = Bun.spawn(["git", ...args], {
      cwd: sessionDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    await process.exited;
    const exitCode = process.exitCode ?? 0;

    if (exitCode !== 0) {
      const stderr = await new Response(process.stderr).text();
      throw new Error(stderr || "Git command failed");
    }

    return await new Response(process.stdout).text();
  }

  async listFiles(sessionId: string, path: string = "."): Promise<string[]> {
    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`;
    const fullPath = `${sessionDir}/${path}`;

    const decoded = await $`ls -la ${fullPath}`.text();

    return decoded.split("\n").filter(Boolean);
  }

  async readFile(sessionId: string, filePath: string): Promise<ReturnType<typeof Bun.file>> {
    const fullPath = `${SESSIONS_DIR}/${sessionId}/repo/${filePath}`;
    return Bun.file(fullPath);
  }

  async writeFile(sessionId: string, filePath: string, content: string) {
    const fullPath = `${SESSIONS_DIR}/${sessionId}/repo/${filePath}`;
    await Bun.write(fullPath, content);
  }
}

export const sessionManager = new SessionManager();
