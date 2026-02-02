import { Elysia } from 'elysia'
import { eq } from 'drizzle-orm'
import index from './index.html'
import { db, schema } from './db'
import { apiRouter } from './api'

const app = new Elysia({ cookie: { secrets: process.env.COOKIE_SECRET || 'change-this-in-production' } })
  .get('/', index)
  .use(apiRouter)
  .onError(({ code, error }) => {
    console.error(`Error ${code}:`, error)
    return new Response(error instanceof Error ? error.message : 'Internal Error', {
      status: code === 'VALIDATION' ? 400 : 500
    })
  })
  .listen(3000)

const gracefulShutdown = async () => {
  console.log('\nShutting down...')
  const runningSessions = await db.select().from(schema.sessions).where(eq(schema.sessions.status, 'running'))
  for (const session of runningSessions) {
    if (session.pid) {
      try {
        await new Promise((resolve) => {
          const killProcess = Bun.spawn(['kill', '-9', String(session.pid)])
          killProcess.exited.then(resolve)
        })
      } catch {
      }
    }
  }
  await db.update(schema.sessions).set({ status: 'stopped', pid: null }).where(eq(schema.sessions.status, 'running'))
  process.exit(0)
}

process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

console.log(`🚀 OpenCode Manager running at ${app.server?.url}`)
