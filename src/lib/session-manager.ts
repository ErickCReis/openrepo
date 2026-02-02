import { $ } from 'bun'
import { mkdir } from 'fs/promises'
import { eq, asc } from 'drizzle-orm'
import { db, schema } from '../db'
import { generateId, getRandomPort } from './utils'

const SESSIONS_DIR = './sessions'

export interface CreateSessionInput {
  repo: string
  branch: string
}

export class SessionManager {
  async createSession(input: CreateSessionInput) {
    const id = generateId()
    const port = getRandomPort()
    const sessionDir = `${SESSIONS_DIR}/${id}`

    await mkdir(sessionDir, { recursive: true })
    

    await Bun.write(
      `${sessionDir}/opencode.json`,
      JSON.stringify({
        server: {
          $schema: 'https://opencode.ai/config.json',
          port,
          hostname: 'http://127.0.0.1'
        }
      }, null, 2)
    )

    const [result] = await db.insert(schema.sessions).values({
      id,
      repo: input.repo,
      branch: input.branch,
      port,
      status: 'stopped',
      createdAt: new Date()
    }).returning()

    if (!result) {
      throw new Error('Failed to create session')
    }

    return {
      id: result.id,
      repo: result.repo,
      branch: result.branch,
      port: result.port,
      status: result.status,
      createdAt: result.createdAt
    }
  }

  async cloneRepo(sessionId: string, githubToken?: string) {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`

    try {
      const authUrl = githubToken
        ? `https://${githubToken}@github.com/${session.repo}`
        : `https://github.com/${session.repo}`

      await $`git clone --depth 1 -b ${session.branch} ${authUrl} ${sessionDir}`
    } catch (error) {
      throw new Error(`Git clone failed: ${error}`)
    }
  }

  async startOpenCode(sessionId: string) {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`

    const opencodeProcess = Bun.spawn(
      ['opencode', 'serve', '--port', session.port.toString(), '--hostname', 'http://127.0.0.1'],
      {
        cwd: sessionDir,
        stdout: 'pipe',
        stderr: 'pipe',
        onExit(proc, exitCode, signalCode, error) {
          console.info('OpenCode process exited with code ' + exitCode)
        },
      }
    )

    await db.update(schema.sessions)
      .set({ status: 'running', pid: opencodeProcess.pid })
      .where(eq(schema.sessions.id, sessionId))
  }

  async stopSession(sessionId: string) {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    try {
      await $`kill -9 ${session.pid}`.nothrow().quiet()
    } catch {
    }

    await db.update(schema.sessions)
      .set({ status: 'stopped', pid: null })
      .where(eq(schema.sessions.id, sessionId))
  }

  async deleteSession(sessionId: string) {
    await this.stopSession(sessionId)

    const sessionDir = `${SESSIONS_DIR}/${sessionId}`
    try {
      await $`rm -rf ${sessionDir}`.nothrow().quiet()
    } catch {
    }

    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId))
  }

  async getSession(sessionId: string) {
    const [result] = await db.select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))

    if (!result) return null

    return {
      id: result.id,
      repo: result.repo,
      branch: result.branch,
      port: result.port,
      pid: result.pid,
      status: result.status,
      createdAt: result.createdAt,
      serverUrl: `http://127.0.0.1:${result.port}`
    }
  }

  async listSessions() {
    const results = await db.select()
      .from(schema.sessions)
      .orderBy(asc(schema.sessions.createdAt))

    return results.map(r => ({
      id: r.id,
      repo: r.repo,
      branch: r.branch,
      port: r.port,
      status: r.status,
      createdAt: r.createdAt,
      serverUrl: `http://127.0.0.1:${r.port}`
    }))
  }

  async getSessionPort(sessionId: string): Promise<number | null> {
    const session = await this.getSession(sessionId)
    return session?.port ?? null
  }

  async runGitCommand(sessionId: string, args: string[]): Promise<string> {
    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`
    const process = Bun.spawn(['git', ...args], {
      cwd: sessionDir,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    await process.exited
    const exitCode = process.exitCode ?? 0

    if (exitCode !== 0) {
      const stderr = await new Response(process.stderr).text()
      throw new Error(stderr || 'Git command failed')
    }

    return await new Response(process.stdout).text()
  }

  async listFiles(sessionId: string, path: string = '.'): Promise<string[]> {
    const sessionDir = `${SESSIONS_DIR}/${sessionId}/repo`
    const fullPath = `${sessionDir}/${path}`

    const decoded = await $`ls -la ${fullPath}`.text()

    return decoded.split('\n').filter(Boolean)
  }

  async readFile(sessionId: string, filePath: string): Promise<ReturnType<typeof Bun.file>> {
    const fullPath = `${SESSIONS_DIR}/${sessionId}/repo/${filePath}`
    return Bun.file(fullPath)
  }

  async writeFile(sessionId: string, filePath: string, content: string) {
    const fullPath = `${SESSIONS_DIR}/${sessionId}/repo/${filePath}`
    await Bun.write(fullPath, content)
  }
}

export const sessionManager = new SessionManager()
