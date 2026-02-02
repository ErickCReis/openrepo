interface GitHubApiResponse<T> {
  data: T
  status: number
}

export interface BranchInfo {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
}

export interface CommitInfo {
  sha: string
  message: string
  author: {
    name: string
    email: string
    date: string
  }
}

export interface PullRequestInfo {
  number: number
  title: string
  body: string
  state: string
  html_url: string
  head: string
  base: string
}

export interface RepoInfo {
  id: number
  name: string
  full_name: string
  default_branch: string
  private: boolean
}

export interface UserRepoInfo {
  id: number
  name: string
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
}

export class GitHubClient {
  private token: string
  private baseUrl = 'https://api.github.com'

  constructor(token: string) {
    this.token = token
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<GitHubApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GitHub API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return { data, status: response.status }
  }

  async getRepo(owner: string, repo: string): Promise<RepoInfo> {
    const { data } = await this.request<RepoInfo>(`/repos/${owner}/${repo}`)
    return data
  }

  async listBranches(owner: string, repo: string): Promise<BranchInfo[]> {
    const { data } = await this.request<BranchInfo[]>(`/repos/${owner}/${repo}/branches`)
    return data
  }

  async listUserRepos(): Promise<UserRepoInfo[]> {
    const { data } = await this.request<UserRepoInfo[]>('/user/repos?per_page=100&sort=updated')
    return data
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<BranchInfo> {
    const { data } = await this.request<BranchInfo>(`/repos/${owner}/${repo}/branches/${branch}`)
    return data
  }

  async createBranch(owner: string, repo: string, branchName: string, baseBranch: string): Promise<BranchInfo> {
    const baseRef = await this.getBranch(owner, repo, baseBranch)
    
    const { data } = await this.request<BranchInfo>(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseRef.commit.sha
      })
    })
    
    return data
  }

  async listCommits(owner: string, repo: string, branch?: string): Promise<CommitInfo[]> {
    const path = branch 
      ? `/repos/${owner}/${repo}/commits?sha=${branch}`
      : `/repos/${owner}/${repo}/commits`
    
    const { data } = await this.request<CommitInfo[]>(path)
    return data
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const refParam = ref ? `?ref=${ref}` : ''
    const { data } = await this.request<{ content: string; encoding: string }>(
      `/repos/${owner}/${repo}/contents/${path}${refParam}`
    )
    
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8')
    }
    return data.content
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<{ commit: { sha: string } }> {
    const encodedContent = Buffer.from(content).toString('base64')
    
    const body: Record<string, unknown> = {
      message,
      content: encodedContent,
      branch
    }
    
    if (sha) {
      body.sha = sha
    }

    const { data } = await this.request<{ commit: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        body: JSON.stringify(body)
      }
    )
    
    return data
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<PullRequestInfo> {
    const { data } = await this.request<PullRequestInfo>(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, body, head, base })
    })
    return data
  }

  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequestInfo[]> {
    const { data } = await this.request<PullRequestInfo[]>(
      `/repos/${owner}/${repo}/pulls?state=${state}`
    )
    return data
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequestInfo> {
    const { data } = await this.request<PullRequestInfo>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}`
    )
    return data
  }

  async compareCommits(owner: string, repo: string, base: string, head: string): Promise<{
    status: string
    files: Array<{
      filename: string
      status: string
      additions: number
      deletions: number
      patch?: string
    }>
  }> {
    const { data } = await this.request<{
      status: string
      files: Array<{
        filename: string
        status: string
        additions: number
        deletions: number
        patch?: string
      }>
    }>(`/repos/${owner}/${repo}/compare/${base}...${head}`)
    return data
  }
}

export function createGitHubClient(token: string): GitHubClient {
  return new GitHubClient(token)
}
