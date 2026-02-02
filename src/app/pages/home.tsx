import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'

import { Button } from '@app/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@app/components/ui/card'
import { Input } from '@app/components/ui/input'
import { Label } from '@app/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@app/components/ui/dialog'
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '@app/components/ui/combobox'
import { GitBranchIcon, PlayIcon, PlusIcon, SquareIcon, TrashIcon, CopyIcon, CheckIcon, GithubLogoIcon } from '@phosphor-icons/react'
import { api } from '@lib/api'
import type { Treaty } from '@elysiajs/eden'

type Session = Treaty.Data<typeof api.sessions.get>['data'][number]
type GitHubUser = Treaty.Data<typeof api.auth.github.user.get>['data']
type UserRepo = NonNullable<Treaty.Data<typeof api.auth.github.repos.get>['data']>[number]

function CreateSessionForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [repoValue, setRepoValue] = useState('')

  const { data: githubUser } = useQuery({
    queryKey: ['githubUser'],
    queryFn: async () => {
      const response = await api.auth.github.user.get()
      if (response.data?.data) {
        return response.data.data as GitHubUser
      }
      return null
    },
    retry: false
  })

  const { data: userRepos, isLoading: isLoadingRepos } = useQuery({
    queryKey: ['userRepos'],
    queryFn: async () => {
      const response = await api.auth.github.repos.get()
      if (response.data?.data) {
        return response.data.data as UserRepo[]
      }
      return []
    },
    enabled: !!githubUser,
    retry: false
  })

  const form = useForm({
    defaultValues: { repo: '', branch: 'main' },
    onSubmit: async ({ value }) => {
      await api.sessions.post({
        repo: value.repo,
        branch: value.branch
      })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onClose()
    }
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="space-y-4">
        <form.Field
          name="repo"
          validators={{
            onChange: ({ value }) => !value ? 'Repository is required' : undefined
          }}
        >
          {(field) => (
            <>
            <Label htmlFor={field.name}>Repository (owner/repo)</Label>
            {githubUser ? (
              <Combobox value={repoValue} onValueChange={(value) => {
                setRepoValue(value || '')
                field.handleChange(value || '')
              }}>
                <ComboboxInput placeholder="Search repositories..." />
                <ComboboxContent>
                  <ComboboxList>
                    {isLoadingRepos ? (
                      <ComboboxEmpty>Loading...</ComboboxEmpty>
                    ) : userRepos?.length === 0 ? (
                      <ComboboxEmpty>No repositories found</ComboboxEmpty>
                    ) : (
                      userRepos?.map(repo => (
                        <ComboboxItem key={repo.id} value={repo.full_name}>
                          <div className="flex flex-col">
                            <span className="font-medium">{repo.name}</span>
                            <span className="text-xs text-muted-foreground">{repo.full_name}</span>
                          </div>
                        </ComboboxItem>
                      ))
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            ) : (
              <Input
                id={field.name}
                name={field.name}
                placeholder="owner/repo"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-red-500 mt-1">{field.state.meta.errors[0]}</p>
            )}
          </>
          )}
        </form.Field>
        <form.Field
          name="branch"
          validators={{
            onChange: ({ value }) => !value ? 'Branch is required' : undefined
          }}
        >
          {(field) => (
            <>
              <Label htmlFor={field.name}>Branch</Label>
              <Input
                id={field.name}
                name={field.name}
                placeholder="main"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-sm text-red-500 mt-1">{field.state.meta.errors[0]}</p>
              )}
            </>
          )}
        </form.Field>
      </div>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        )}
      />
    </form>
  )
}

export function Home() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: githubUser, isLoading: isLoadingGithub } = useQuery({
    queryKey: ['githubUser'],
    queryFn: async () => {
      const response = await api.auth.github.user.get()
      if (response.data?.data) {
        return response.data.data as GitHubUser
      }
      return null
    },
    retry: false
  })

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const success = searchParams.get('oauth_success')
    const error = searchParams.get('oauth_error')
    
    if (success === 'true') {
      queryClient.invalidateQueries({ queryKey: ['githubUser'] })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      console.error('OAuth error:', error)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [queryClient])

  const disconnectMutation = useMutation({
    mutationFn: async () => 
       api.auth.github.delete()
    ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['githubUser'] })
    }
  })

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions.get().then(res => res.data?.data),
    refetchInterval: 5000
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">OpenCode Manager</h1>
            <p className="text-gray-500 mt-1">Manage your OpenCode sessions</p>
          </div>
          <div className="flex items-center gap-4">
            {githubUser ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <GithubLogoIcon className="w-4 h-4" />
                <span>{githubUser.username}</span>
                <Button variant="ghost" size="sm" onClick={() => disconnectMutation.mutate()}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => window.location.href = '/api/auth/github'}>
                <GithubLogoIcon className="w-4 h-4 mr-2" />
                Connect GitHub
              </Button>
            )}
            <Button onClick={() => setIsCreateOpen(true)}>
              <PlusIcon className="w-4 h-4 mr-2" />
              New Session
            </Button>
          </div>
        </div>

        {isLoading && <div className="text-center py-12 text-gray-500">Loading sessions...</div>}
        {isError && <div className="text-center py-12 text-red-500">Failed to load sessions</div>}
        {!isLoading && !isError && sessions?.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-gray-500 mb-4">No sessions yet</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Create your first session
              </Button>
            </CardContent>
          </Card>
        )}
        {!isLoading && !isError && sessions && sessions.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map(session => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Clone a repository and start an OpenCode session
            </DialogDescription>
          </DialogHeader>
          <CreateSessionForm onClose={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SessionCard({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)

  const stopMutation = useMutation({
    mutationFn: () => api.sessions({id: session.id}).stop.post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })

  const startMutation = useMutation({
    mutationFn: () => api.sessions({id: session.id}).start.post(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.sessions({id: session.id}).delete(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })

  const copyUrl = () => {
    navigator.clipboard.writeText(session.serverUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{session.repo}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <GitBranchIcon className="w-3 h-3" />
              {session.branch}
            </CardDescription>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            session.status === 'running'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {session.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 font-mono">
          <a
            href={session.serverUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:text-blue-600 underline"
          >
            {session.serverUrl}
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={copyUrl}
          >
            {copied ? <CheckIcon className="w-3 h-3 text-green-600" /> : <CopyIcon className="w-3 h-3" />}
          </Button>
        </div>

        <div className="flex gap-2">
          {session.status === 'running' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="flex-1"
            >
              <SquareIcon className="w-4 h-4 mr-1" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="flex-1"
            >
              <PlayIcon className="w-4 h-4 mr-1" />
              Start
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { if (confirm('Delete session?')) deleteMutation.mutate() }}
            disabled={deleteMutation.isPending}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

