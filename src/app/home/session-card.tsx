import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@app/components/ui/card";
import {
  GitBranchIcon,
  PlayIcon,
  SquareIcon,
  TrashIcon,
  CopyIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { api } from "@lib/api";

type Session = Awaited<ReturnType<typeof api.sessions.get>>["data"][number];

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const stopMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.sessions({ id: session.id }).stop.post();
      if (error) throw error.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.sessions({ id: session.id }).start.post();
      if (error) throw error.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.sessions({ id: session.id }).delete();
      if (error) throw error.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  function copyUrl() {
    void navigator.clipboard.writeText(session.serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              session.status === "running"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
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
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copyUrl}>
            {copied ? (
              <CheckIcon className="w-3 h-3 text-green-600" />
            ) : (
              <CopyIcon className="w-3 h-3" />
            )}
          </Button>
        </div>

        <div className="flex gap-2">
          {session.status === "running" ? (
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
            onClick={() => {
              if (confirm("Delete session?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
