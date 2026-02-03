import { useQuery } from "@tanstack/react-query";

import { Badge } from "@app/components/ui/badge";
import { api } from "@lib/api";
import { cn } from "@/lib/utils";

type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
};

interface ActionsStatusProps {
  repo: string;
  branch?: string;
}

const failureStates = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
]);

export function ActionsStatus({ repo, branch }: ActionsStatusProps) {
  const [owner, name] = repo.split("/");

  if (!owner || !name) {
    return (
      <Badge variant="outline" className="text-xs">
        Actions: invalid repo
      </Badge>
    );
  }

  const { data: githubUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ["githubUser"],
    queryFn: () => api.auth.github.user.get().then((res) => res.data),
    retry: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["actionsStatus", repo, branch],
    queryFn: () =>
      api
        .github({ owner })
        .repo({ repo: name })
        .actions.runs.get({
          query: branch ? { branch } : {},
        })
        .then((res) => res.data),
    enabled: !!githubUser && !!owner && !!name,
    retry: false,
  });

  if (isLoadingUser) {
    return (
      <Badge variant="outline" className="text-xs">
        Actions: loading
      </Badge>
    );
  }

  if (!githubUser) {
    return (
      <Badge variant="outline" className="text-xs">
        Actions: connect GitHub
      </Badge>
    );
  }

  if (isLoading) {
    return (
      <Badge variant="outline" className="text-xs">
        Actions: loading
      </Badge>
    );
  }

  if (isError || !data) {
    return (
      <Badge variant="outline" className="text-xs">
        Actions: unavailable
      </Badge>
    );
  }

  const run: WorkflowRun | undefined = data[0];

  if (!run) {
    return (
      <Badge variant="outline" className="text-xs">
        Actions: no runs
      </Badge>
    );
  }

  const statusLabel =
    run.status === "completed" ? run.conclusion || "completed" : run.status;

  const isSuccess = run.status === "completed" && run.conclusion === "success";
  const isFailure = run.status === "completed" && run.conclusion && failureStates.has(run.conclusion);

  const badgeClass = cn(
    "text-xs",
    isSuccess && "bg-emerald-600 text-white hover:bg-emerald-600/90",
    isFailure && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    !isSuccess && !isFailure && "bg-secondary text-secondary-foreground",
  );

  const content = `Actions: ${statusLabel}`;

  if (run.html_url) {
    return (
      <a href={run.html_url} target="_blank" rel="noopener noreferrer">
        <Badge variant="secondary" className={badgeClass}>
          {content}
        </Badge>
      </a>
    );
  }

  return (
    <Badge variant="secondary" className={badgeClass}>
      {content}
    </Badge>
  );
}
