import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@app/components/ui/button";
import { Card, CardContent } from "@app/components/ui/card";
import { ThemeToggle } from "@app/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@app/components/ui/dialog";
import { GithubLogoIcon, PlusIcon } from "@phosphor-icons/react";
import { api } from "@lib/api";
import { CreateSessionForm } from "./create-session-form";
import { SessionCard } from "./session-card";
import { CreateProjectForm } from "./create-project-form";
import { ProjectCard } from "./project-card";

export function Home() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: githubUser } = useQuery({
    queryKey: ["githubUser"],
    queryFn: () => api.auth.github.user.get().then((res) => res.data),
    retry: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.auth.github.delete();
      if (error) throw error.value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["githubUser"] });
    },
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions.get().then((res) => res.data),
    refetchInterval: 5000,
  });

  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.get().then((res) => res.data),
  });

  const isError = sessions === null;

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const success = searchParams.get("oauth_success");
    const error = searchParams.get("oauth_error");

    if (success === "true") {
      void queryClient.invalidateQueries({ queryKey: ["githubUser"] });
      toast.success("GitHub account connected successfully");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      console.error("OAuth error:", error);
      toast.error("GitHub authentication failed", { description: error });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">OpenRepo</h1>
            <p className="text-muted-foreground mt-1">Manage your OpenCode sessions</p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {githubUser ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <GithubLogoIcon className="w-4 h-4" />
                <span>{githubUser.username}</span>
                <Button variant="ghost" size="sm" onClick={() => disconnectMutation.mutate()}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => (window.location.href = "/api/auth/github")}>
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

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Projects</h2>
            <p className="text-muted-foreground text-sm">Linked repositories</p>
          </div>
          <Button variant="outline" onClick={() => setIsCreateProjectOpen(true)}>
            <PlusIcon className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {isLoadingProjects && (
          <div className="text-center py-8 text-muted-foreground">Loading projects...</div>
        )}
        {!isLoadingProjects && projects?.length === 0 && (
          <Card className="text-center py-8 mb-10">
            <CardContent>
              <p className="text-muted-foreground mb-4">No projects yet</p>
              <Button variant="outline" onClick={() => setIsCreateProjectOpen(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Create your first project
              </Button>
            </CardContent>
          </Card>
        )}
        {!isLoadingProjects && projects && projects.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-10">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">Loading sessions...</div>
        )}
        {isError && <div className="text-center py-12 text-destructive">Failed to load sessions</div>}
        {!isLoading && !isError && sessions?.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">No sessions yet</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Create your first session
              </Button>
            </CardContent>
          </Card>
        )}
        {!isLoading && !isError && sessions && sessions.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>Clone a repository and start an OpenCode session</DialogDescription>
          </DialogHeader>
          <CreateSessionForm onClose={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Link a GitHub repository for quick sessions</DialogDescription>
          </DialogHeader>
          <CreateProjectForm onClose={() => setIsCreateProjectOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
