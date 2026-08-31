import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Key01Icon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { appClient, type AuthToken } from "@/lib/app-client";
import {
  Button,
  Input,
  Label,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
} from "@/components/ui";

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
}

interface EnvironmentOption {
  id: string;
  name: string;
  slug: string;
}

type TokenScope = AuthToken["scopes"][number];
type Boundary = "organization" | "project" | "environment";

const permissionOptions: Array<{
  value: TokenScope;
  label: string;
  description: string;
}> = [
  {
    value: "tunnel:connect",
    label: "Connect tunnels",
    description: "Authenticate tunnel clients for this organization.",
  },
  {
    value: "secrets:read",
    label: "Read secrets",
    description: "List, reveal, export, pull, and inject secret values.",
  },
  {
    value: "secrets:write",
    label: "Write secrets",
    description: "Create, update, import, and roll back values.",
  },
  {
    value: "secrets:delete",
    label: "Delete secrets",
    description: "Delete individual secrets from runtime delivery.",
  },
];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

export function CreateTokenModal({ isOpen, onClose }: CreateTokenModalProps) {
  const queryClient = useQueryClient();
  const { orgSlug } = useParams({ from: "/$orgSlug/tokens" });
  const [name, setName] = useState("");
  const [boundary, setBoundary] = useState<Boundary>("organization");
  const [projectId, setProjectId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [expiresIn, setExpiresIn] = useState<"30d" | "90d" | "1y" | "never">(
    "90d",
  );
  const [scopes, setScopes] = useState<TokenScope[]>(["tunnel:connect"]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const clearTokenTimerRef = useRef<number | null>(null);
  const createRequestRef = useRef(0);

  const projectsQuery = useQuery({
    queryKey: ["secrets-project-options", orgSlug],
    enabled: isOpen && boundary !== "organization",
    queryFn: async () => {
      const payload = await readJson<{ projects?: ProjectOption[] }>(
        await fetch(`/api/${orgSlug}/secrets/projects`, {
          credentials: "same-origin",
        }),
      );
      return payload.projects ?? [];
    },
  });

  const selectedProject = projectsQuery.data?.find(
    (project) => project.id === projectId,
  );
  const environmentsQuery = useQuery({
    queryKey: ["secrets-project-environments", orgSlug, selectedProject?.slug],
    enabled: isOpen && boundary === "environment" && !!selectedProject,
    queryFn: async () => {
      const payload = await readJson<{
        project?: { environments?: EnvironmentOption[] };
        environments?: EnvironmentOption[];
      }>(
        await fetch(
          `/api/${orgSlug}/secrets/projects/${encodeURIComponent(selectedProject!.slug)}`,
          { credentials: "same-origin" },
        ),
      );
      return payload.environments ?? payload.project?.environments ?? [];
    },
  });

  const hasSecretsPermission = scopes.some((scope) =>
    scope.startsWith("secrets:"),
  );
  const canSubmit =
    name.trim().length > 0 &&
    scopes.length > 0 &&
    (boundary === "organization" ||
      (boundary === "project" && !!projectId) ||
      (boundary === "environment" && !!projectId && !!environmentId));

  const clearTokenTimer = () => {
    if (clearTokenTimerRef.current !== null) {
      window.clearTimeout(clearTokenTimerRef.current);
      clearTokenTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (clearTokenTimerRef.current !== null) {
        window.clearTimeout(clearTokenTimerRef.current);
      }
    },
    [],
  );

  const createToken = async () => {
    const requestId = ++createRequestRef.current;
    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await appClient.authTokens.create({
        name: name.trim(),
        orgSlug,
        scopes,
        projectId: boundary === "organization" ? null : projectId,
        environmentId: boundary === "environment" ? environmentId : null,
        expiresIn,
      });
      if ("error" in response) throw new Error(response.error);
      if (requestId !== createRequestRef.current) return;
      clearTokenTimer();
      setCreatedToken(response.token);
      clearTokenTimerRef.current = window.setTimeout(() => {
        setCreatedToken(null);
        setCopied(false);
        clearTokenTimerRef.current = null;
      }, 30_000);
      void queryClient.invalidateQueries({
        queryKey: ["auth-tokens", orgSlug],
      });
    } catch (error) {
      if (requestId === createRequestRef.current) {
        setCreateError(
          error instanceof Error
            ? error.message
            : "The token could not be created.",
        );
      }
    } finally {
      if (requestId === createRequestRef.current) setIsCreating(false);
    }
  };

  const boundaryOptions = useMemo(
    () => [
      {
        value: "organization",
        label: "Entire organization",
        description: "Every Secrets project and environment.",
      },
      {
        value: "project",
        label: "One project",
        description: "Every environment in a selected project.",
        disabled: !hasSecretsPermission,
      },
      {
        value: "environment",
        label: "One environment",
        description: "Only the selected environment.",
        disabled: !hasSecretsPermission,
      },
    ],
    [hasSecretsPermission],
  );

  const resetAndClose = () => {
    createRequestRef.current += 1;
    clearTokenTimer();
    setName("");
    setBoundary("organization");
    setProjectId("");
    setEnvironmentId("");
    setExpiresIn("90d");
    setScopes(["tunnel:connect"]);
    setCreatedToken(null);
    setCopied(false);
    setIsCreating(false);
    setCreateError(null);
    onClose();
  };

  const toggleScope = (scope: TokenScope) => {
    const next = scopes.includes(scope)
      ? scopes.filter((item) => item !== scope)
      : [...scopes, scope];

    setScopes(next);
    if (
      boundary !== "organization" &&
      !next.some((item) => item.startsWith("secrets:"))
    ) {
      setBoundary("organization");
      setProjectId("");
      setEnvironmentId("");
    }
  };

  const copyToken = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} size="lg" appearance="flat">
      <ModalHeader
        icon={<HugeiconsIcon icon={Key01Icon} size={20} strokeWidth={1.8} />}
        iconClassName="bg-white/[0.05] text-zinc-300"
        title={createdToken ? "Copy your token" : "Create API token"}
        description={
          createdToken
            ? "This credential is shown once and cannot be recovered."
            : "Choose exactly what this machine credential can access."
        }
        onClose={resetAndClose}
      />

      {createdToken ? (
        <>
          <ModalContent className="ph-no-capture space-y-5">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm leading-6 text-amber-100/80">
              Store this token in your secret manager. OutRay stores only its
              hash, so closing this dialog permanently hides it.
            </div>
            <div>
              <Label>Your token</Label>
              <div className="mt-2 flex items-stretch gap-2">
                <code className="min-w-0 flex-1 break-all rounded-xl border border-white/[0.09] bg-black/30 px-4 py-3 font-mono text-sm leading-6 text-zinc-200">
                  {createdToken}
                </code>
                <button
                  type="button"
                  onClick={copyToken}
                  className={`flex w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    copied
                      ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-400"
                      : "border-white/[0.09] bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                  }`}
                  aria-label="Copy token"
                >
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    size={18}
                    strokeWidth={1.9}
                  />
                </button>
              </div>
            </div>
          </ModalContent>
          <ModalFooter>
            <Button onClick={resetAndClose}>Done</Button>
          </ModalFooter>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !isCreating) void createToken();
          }}
        >
          <ModalContent className="space-y-6">
            <div>
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production deploy"
                maxLength={100}
                autoFocus
                className="mt-2"
              />
            </div>

            <div>
              <Label>Permissions</Label>
              <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.08]">
                {permissionOptions.map((permission, index) => {
                  const selected = scopes.includes(permission.value);
                  return (
                    <button
                      key={permission.value}
                      type="button"
                      onClick={() => toggleScope(permission.value)}
                      className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025] ${
                        index > 0 ? "border-t border-white/[0.07]" : ""
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                          selected
                            ? "border-emerald-400/40 bg-emerald-400/[0.12] text-emerald-400"
                            : "border-white/[0.12] text-transparent"
                        }`}
                      >
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          size={12}
                          strokeWidth={2.1}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-200">
                          {permission.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-zinc-600">
                          {permission.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Resource scope</Label>
                <Select
                  className="mt-2"
                  value={boundary}
                  onChange={(value) => {
                    setBoundary(value as Boundary);
                    setProjectId("");
                    setEnvironmentId("");
                  }}
                  options={boundaryOptions}
                />
              </div>
              <div>
                <Label>Expires</Label>
                <Select
                  className="mt-2"
                  value={expiresIn}
                  onChange={(value) =>
                    setExpiresIn(value as "30d" | "90d" | "1y" | "never")
                  }
                  options={[
                    { value: "30d", label: "30 days" },
                    { value: "90d", label: "90 days" },
                    { value: "1y", label: "One year" },
                    { value: "never", label: "Never" },
                  ]}
                />
              </div>
            </div>

            {boundary !== "organization" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={boundary === "project" ? "sm:col-span-2" : ""}>
                  <Label>Project</Label>
                  <Select
                    className="mt-2"
                    value={projectId}
                    onChange={(value) => {
                      setProjectId(value);
                      setEnvironmentId("");
                    }}
                    placeholder={
                      projectsQuery.isLoading
                        ? "Loading projects…"
                        : "Select project"
                    }
                    disabled={projectsQuery.isLoading}
                    options={(projectsQuery.data ?? []).map((project) => ({
                      value: project.id,
                      label: project.name,
                      description: project.slug,
                    }))}
                  />
                </div>
                {boundary === "environment" && (
                  <div>
                    <Label>Environment</Label>
                    <Select
                      className="mt-2"
                      value={environmentId}
                      onChange={setEnvironmentId}
                      placeholder={
                        !projectId
                          ? "Select a project first"
                          : environmentsQuery.isLoading
                            ? "Loading environments…"
                            : "Select environment"
                      }
                      disabled={!projectId || environmentsQuery.isLoading}
                      options={(environmentsQuery.data ?? []).map(
                        (environment) => ({
                          value: environment.id,
                          label: environment.name,
                          description: environment.slug,
                        }),
                      )}
                    />
                  </div>
                )}
              </div>
            )}

            {createError && (
              <p className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-[13px] text-red-300">
                {createError}
              </p>
            )}
          </ModalContent>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} isLoading={isCreating}>
              Create token
            </Button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}
