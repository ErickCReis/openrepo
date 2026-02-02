import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  branch: text('branch').notNull(),
  port: integer('port').notNull(),
  pid: integer('pid'),
  status: text('status', { enum: ['running', 'stopped'] }).notNull().default('stopped'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

export const githubTokens = sqliteTable('github_tokens', {
  id: text('id').primaryKey(),
  githubUserId: integer('github_user_id').notNull().unique(),
  username: text('username').notNull(),
  email: text('email'),
  accessToken: text('access_token').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
