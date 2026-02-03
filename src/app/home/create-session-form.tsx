import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";

import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { DialogFooter } from "@app/components/ui/dialog";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@app/components/ui/combobox";
import { api } from "@lib/api";

export function CreateSessionForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [repoValue, setRepoValue] = useState("");
  const [branchValue, setBranchValue] = useState("main");

  const { data: githubUser } = useQuery({
    queryKey: ["githubUser"],
    queryFn: async () => {
      const { data, error } = await api.auth.github.user.get();
      if (error) throw error.value;
      return data;
    },
    retry: false,
  });

  const { data: userRepos, isLoading: isLoadingRepos } = useQuery({
    queryKey: ["userRepos"],
    queryFn: async () => {
      const { data, error } = await api.auth.github.repos.get();
      if (error) throw error.value;
      return data;
    },
    enabled: !!githubUser,
    retry: false,
  });

  const [owner, repo] = repoValue.split("/");
  const { data: repoBranches, isLoading: isLoadingBranches } = useQuery({
    queryKey: ["repoBranches", owner, repo],
    queryFn: async () => {
      const { data, error } = await api
        .github({ owner: owner! })
        .repo({ repo: repo! })
        .branches.get();
      if (error) throw error.value;
      return data;
    },
    enabled: !!githubUser && !!owner && !!repo,
    retry: false,
  });

  const form = useForm({
    defaultValues: { repo: "", branch: "main" },
    onSubmit: async ({ value }) => {
      const { error } = await api.sessions.post({
        repo: value.repo,
        branch: value.branch,
      });
      if (error) throw error.value;
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="space-y-4">
        <form.Field
          name="repo"
          validators={{
            onChange: ({ value }) => (!value ? "Repository is required" : undefined),
          }}
        >
          {(field) => (
            <>
              <Label htmlFor={field.name}>Repository (owner/repo)</Label>
              {githubUser ? (
                <Combobox
                  value={repoValue}
                  onValueChange={(value) => {
                    setRepoValue(value || "");
                    field.handleChange(value || "");
                    setBranchValue("main");
                    form.setFieldValue("branch", "main");
                  }}
                >
                  <ComboboxInput placeholder="Search repositories..." />
                  <ComboboxContent>
                    <ComboboxList>
                      {isLoadingRepos ? (
                        <ComboboxEmpty>Loading...</ComboboxEmpty>
                      ) : userRepos?.length === 0 ? (
                        <ComboboxEmpty>No repositories found</ComboboxEmpty>
                      ) : (
                        userRepos?.map((repo) => (
                          <ComboboxItem key={repo.id} value={repo.full_name}>
                            <div className="flex flex-col">
                              <span className="font-medium">{repo.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {repo.full_name}
                              </span>
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
            onChange: ({ value }) => (!value ? "Branch is required" : undefined),
          }}
        >
          {(field) => (
            <>
              <Label htmlFor={field.name}>Branch</Label>
              {githubUser && repoValue ? (
                <Combobox
                  value={branchValue}
                  onValueChange={(value) => {
                    setBranchValue(value || "main");
                    field.handleChange(value || "main");
                  }}
                >
                  <ComboboxInput placeholder="Search branches..." />
                  <ComboboxContent>
                    <ComboboxList>
                      {isLoadingBranches ? (
                        <ComboboxEmpty>Loading...</ComboboxEmpty>
                      ) : repoBranches?.length === 0 ? (
                        <ComboboxEmpty>No branches found</ComboboxEmpty>
                      ) : (
                        repoBranches?.map((branch) => (
                          <ComboboxItem key={branch.name} value={branch.name}>
                            {branch.name}
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
                  placeholder="main"
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
      </div>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
        children={([canSubmit, isSubmitting]) => (
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        )}
      />
    </form>
  );
}
