import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@app/components/ui/card";
import { GitBranchIcon, PlayIcon, TrashIcon } from "@phosphor-icons/react";
import { api } from "@lib/api";
import { ActionsStatus } from "./actions-status";

type Project = Awaited<ReturnType<typeof api.projects.get>>["data"][number];

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const queryClient = useQueryClient();

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.sessions.post({
        repo: project.repo,
        branch: project.defaultBranch,
      });
      if (error) throw error.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.projects({ id: project.id }).delete();
      if (error) throw error.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg truncate">{project.name}</CardTitle>
        <CardDescription className="flex items-center gap-2 text-sm">
          <a
            href={`https://github.com/${project.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate underline hover:text-primary"
          >
            {project.repo}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranchIcon className="w-3 h-3" />
          {project.defaultBranch}
        </div>
        <ActionsStatus repo={project.repo} branch={project.defaultBranch} />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => createSessionMutation.mutate()}
            disabled={createSessionMutation.isPending}
            className="flex-1"
          >
            <PlayIcon className="w-4 h-4 mr-1" />
            New Session
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Delete project?")) deleteProjectMutation.mutate();
            }}
            disabled={deleteProjectMutation.isPending}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
