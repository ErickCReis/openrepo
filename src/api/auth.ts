import { Elysia, redirect, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db, schema } from '@db'
import { getCookieSchema } from '@api'
import { createGitHubClient } from '@lib/github-client'

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

export interface GitHubUser {
  id: number
  login: string
  email: string | null
  name: string | null
  avatar_url: string
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code
    })
  })

  const data = await response.json()
  
  if (data.error) {
    throw new Error(data.error_description || data.error)
  }

  return data.access_token
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to get GitHub user info')
  }

  return response.json()
}

export const authRouter = new Elysia()
  .get('/api/auth/github', () => {
    if (!GITHUB_CLIENT_ID) {
      return { 
        success: false, 
        error: 'GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' 
      }
    }

    const redirectUrl = new URL('https://github.com/login/oauth/authorize')
    redirectUrl.searchParams.set('client_id', GITHUB_CLIENT_ID)
    redirectUrl.searchParams.set('redirect_uri', `${APP_URL}/api/auth/github/callback`)
    redirectUrl.searchParams.set('scope', 'repo read:user')
    redirectUrl.searchParams.set('state', crypto.randomUUID())

    return redirect(redirectUrl.toString())
  })
  .get('/api/auth/github/callback', async ({ query, set, cookie }) => {
    const { code, error } = query

    if (error) {
      return redirect(`${APP_URL}/?oauth_error=${encodeURIComponent(error)}`)
    }

    if (!code) {
      return redirect(`${APP_URL}/?oauth_error=no_code`)
    }

    try {
      const accessToken = await exchangeCodeForToken(code)
      const githubUser = await getGitHubUser(accessToken)

      const [existingUser] = await db.select()
        .from(schema.githubTokens)
        .where(eq(schema.githubTokens.githubUserId, githubUser.id))
        .limit(1)

      let tokenId: string

      if (existingUser) {
        await db.update(schema.githubTokens)
          .set({ 
            accessToken, 
            updatedAt: new Date() 
          })
          .where(eq(schema.githubTokens.githubUserId, githubUser.id))
        tokenId = existingUser.id
      } else {
        const { randomUUID } = await import('node:crypto')
        tokenId = randomUUID()
        await db.insert(schema.githubTokens).values({
          id: tokenId,
          githubUserId: githubUser.id,
          username: githubUser.login,
          email: githubUser.email,
          accessToken,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }

      cookie.github_token_id.value = tokenId

      return redirect(`${APP_URL}/?oauth_success=true`)
    } catch (err) {
      console.error('GitHub OAuth error:', err)
      return redirect(`${APP_URL}/?oauth_error=auth_failed`)
    }
  }, {
    cookie: getCookieSchema(),
  })
  .get('/api/auth/github/user', async ({ cookie }) => {
    const tokenId = cookie.github_token_id.value

    if (!tokenId) {
      return { success: false, error: 'Not authenticated' }
    }

    const [tokenRecord] = await db.select()
      .from(schema.githubTokens)
      .where(eq(schema.githubTokens.id, tokenId))
      .limit(1)

    if (!tokenRecord) {
      return { success: false, error: 'Token not found' }
    }

    return { 
      success: true, 
      data: {
        id: tokenRecord.githubUserId,
        username: tokenRecord.username,
        email: tokenRecord.email
      }
    }
  }, {
    cookie: getCookieSchema(),
  })
  .delete('/api/auth/github', ({ cookie }) => {
    cookie.github_token_id.remove()
    return { success: true }
  }, {
    cookie: getCookieSchema(),
  })
  .get('/api/auth/github/repos', async ({ cookie }) => {
    const tokenId = cookie.github_token_id.value

    if (!tokenId) {
      return { success: false, error: 'Not authenticated' }
    }

    const [tokenRecord] = await db.select()
      .from(schema.githubTokens)
      .where(eq(schema.githubTokens.id, tokenId))
      .limit(1)

    if (!tokenRecord) {
      return { success: false, error: 'Token not found' }
    }

    try {
      const client = createGitHubClient(tokenRecord.accessToken)
      const repos = await client.listUserRepos()
      return { success: true, data: repos }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch repos'
      }
    }
  }, {
    cookie: getCookieSchema(),
  })
