import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { sessionManager } from '@lib/session-manager'
import { db, schema } from '@db'
import { getCookieSchema } from '@api'

export const sessionsRouter = new Elysia()
  .get('/api/sessions', async () => {
    const sessions = await sessionManager.listSessions()
    return { success: true, data: sessions }
  })
  .get('/api/sessions/:id', async ({ params }) => {
    const session = await sessionManager.getSession(params.id)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, data: session }
  })
  .post('/api/sessions', async ({ body, cookie }) => {
    try {
      const tokenId = cookie.github_token_id.value
      let githubToken: string | undefined

      if (tokenId) {
        const [tokenRecord] = await db.select()
          .from(schema.githubTokens)
          .where(eq(schema.githubTokens.id, tokenId))
          .limit(1)
        
        if (tokenRecord) {
          githubToken = tokenRecord.accessToken
        }
      }

      const session = await sessionManager.createSession({
        repo: body.repo,
        branch: body.branch
      })
      await sessionManager.cloneRepo(session.id, githubToken)
      await sessionManager.startOpenCode(session.id)
      return { success: true, data: session }
    } catch (error) {
      console.error(error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create session' 
      }
    }
  }, {
    cookie: getCookieSchema(),
    body: t.Object({
      repo: t.String(),
      branch: t.String()
    })
  })
  .post('/api/sessions/:id/start', async ({ params }) => {
    try {
      await sessionManager.startOpenCode(params.id)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to start session' 
      }
    }
  })
  .post('/api/sessions/:id/stop', async ({ params }) => {
    try {
      await sessionManager.stopSession(params.id)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to stop session' 
      }
    }
  })
  .delete('/api/sessions/:id', async ({ params }) => {
    try {
      await sessionManager.deleteSession(params.id)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete session' 
      }
    }
  })
  .get('/api/sessions/:id/files', async ({ params, query }) => {
    try {
      const files = await sessionManager.listFiles(params.id, query.path || '.')
      return { success: true, data: files }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to list files' 
      }
    }
  })
  .get('/api/sessions/:id/files/*', async ({ params }) => {
    try {
      const filePath = params['*']
      const file = await sessionManager.readFile(params.id, filePath)
      const content = await file.text()
      return { success: true, data: { content, path: filePath } }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to read file' 
      }
    }
  })
  .post('/api/sessions/:id/git', async ({ params, body }) => {
    try {
      const output = await sessionManager.runGitCommand(params.id, body.args)
      return { success: true, data: output }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Git command failed' 
      }
    }
  }, {
    body: t.Object({
      args: t.Array(t.String())
    })
  })
