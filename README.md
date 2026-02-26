# OpenRepo

A web application for managing OpenCode sessions. Clone repositories, start coding sessions, and manage your development workflow through a simple web interface.

## Features

- GitHub OAuth integration for accessing private repositories
- Create sessions from any GitHub repository
- Start/stop OpenCode instances
- Browse files and run git commands within sessions
- Real-time session status updates

## Tech Stack

- **Runtime**: Bun
- **Backend**: Elysia
- **Frontend**: React 19 + TailwindCSS
- **Database**: SQLite (Drizzle ORM)
- **Data Fetching**: TanStack Query

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- GitHub OAuth App credentials (for GitHub integration)

### Installation

```bash
bun install
```

### Environment Variables

Create a `.env` file:

```env
COOKIE_SECRET=your-secret-key
APP_URL=https://or.erickr.dev
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

For GitHub OAuth, configure the callback URL as:

`https://or.erickr.dev/api/auth/github/callback`

### Database Setup

```bash
bun run db:push
```

### Development

```bash
bun run dev
```

The app will be available at `http://localhost:3000`.

### Production

```bash
bun run start
```

When deploying with Docker behind a reverse proxy, expose only port `3000` publicly.
OpenCode worker ports stay internal and are proxied through `/opencode/:id/*`.

## Scripts

- `bun run dev` - Start development server with hot reload
- `bun run start` - Start production server
- `bun run check` - Run linting and formatting
- `bun run db:generate` - Generate database migrations
- `bun run db:push` - Push schema changes to database
