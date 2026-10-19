import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";

type Organization = { id: string; name: string; slug: string };
type Props = { children?: React.ReactNode; [key: string]: any };
type OrganizationList = {
  data: Organization[];
  isPending: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
};

const existingOrganization = { id: "acme-id", name: "Acme", slug: "acme" };
const createdOrganization = { id: "pied-piper-id", name: "Pied Piper", slug: "pied-piper" };
const Skeleton = () => null;
const AccessPage = (_props: Props) => null;
const Outlet = () => null;
const Navigate = (_props: Props) => null;

function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

/** Exercise the real route controllers, replacing only their external boundaries. */
async function loadRoute(path: string, dependencies: Record<string, unknown>) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as { Route: { options: { component: () => React.ReactElement<Props> } } } };
  runInNewContext(compiled, { React, console, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier in dependencies) return dependencies[specifier];
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => null };
      if (specifier.startsWith("@outray/icons/")) return { __esModule: true, default: [] };
      throw new Error(`Unexpected organization route dependency: ${specifier}`);
    },
  });
  return module.exports.Route.options.component;
}

async function onboardingController(initialOrganizations: Organization[]) {
  const events: string[] = [];
  const navigations: Props[] = [];
  const values: any[] = [];
  let hookIndex = 0;
  let listSubscriptions = 0;
  let finishRefetch!: () => void;
  const refetchFinished = new Promise<void>((resolve) => { finishRefetch = resolve; });
  const list: OrganizationList = {
    data: initialOrganizations,
    isPending: false,
    isRefetching: false,
    async refetch() {
      events.push("refresh-organizations");
      list.isRefetching = true;
      await refetchFinished;
      list.data = [...initialOrganizations, createdOrganization];
      list.isRefetching = false;
    },
  };
  const Component = await loadRoute("../src/routes/onboarding.tsx", {
    react: { ...React,
      useState(initial: unknown) {
        const slot = hookIndex++;
        if (!(slot in values)) values[slot] = initial;
        return [values[slot], (value: unknown) => { values[slot] = value; }];
      },
      useEffect: () => {},
      useCallback: (callback: unknown) => callback,
    },
    "@tanstack/react-router": {
      createFileRoute: () => (options: object) => ({ options }),
      Link: () => null,
      Navigate,
      useNavigate: () => async (destination: Props) => {
        events.push("navigate");
        navigations.push(destination);
      },
    },
    "@/lib/auth-client": { authClient: {
      useSession: () => ({ data: { session: { id: "session-id" }, user: { name: "User", email: "user@example.test" } }, isPending: false }),
      useListOrganizations: () => { listSubscriptions++; return list; },
      organization: {
        async create(input: Props) {
          events.push("create");
          assert.equal(input.name, createdOrganization.name);
          assert.equal(input.slug, createdOrganization.slug);
          return { data: createdOrganization, error: null };
        },
        async setActive(input: Props) {
          events.push("set-active");
          assert.equal(input.organizationId, createdOrganization.id);
          return { data: createdOrganization, error: null };
        },
      },
    } },
    "@/lib/app-client": { appClient: {} },
    "@/lib/instance-context": { useInstance: () => ({ workspaceUrlPrefix: "localhost:6767/" }) },
    "@/lib/store": { useAppStore: (selector: (state: Props) => unknown) => selector({
      setSelectedOrganization: (organization: Organization) => {
        assert.equal(organization.id, createdOrganization.id);
        events.push("select-organization");
      },
    }) },
  });
  const render = () => { hookIndex = 0; return elements(Component()); };
  render().find((element) => element.type === "input" && element.props.name === "name")!.props.onChange({ target: { value: createdOrganization.name } });
  return {
    events, navigations, list,
    get listSubscriptions() { return listSubscriptions; },
    submit: () => render().find((element) => element.type === "form")!.props.onSubmit({ preventDefault() {} }) as Promise<void>,
    finishRefetch,
  };
}

async function dashboardComponent(list: OrganizationList, slug = createdOrganization.slug) {
  const unusedComponent = () => null;
  const Component = await loadRoute("../src/routes/$orgSlug.tsx", {
    react: { ...React, useState: (initial: unknown) => [initial, () => {}], useEffect: () => {} },
    "@tanstack/react-router": {
      createFileRoute: () => (options: object) => ({ options, useParams: () => ({ orgSlug: slug }) }),
      useLocation: () => ({ pathname: `/${slug}/get-started` }),
      Outlet, Navigate,
    },
    "@/lib/auth-client": { authClient: {
      useListOrganizations: () => list,
      useActiveOrganization: () => ({ data: null }),
      useSession: () => ({ data: { user: { id: "user-id" } } }),
    } },
    "@/lib/store": { useAppStore: () => () => {} },
    "@/lib/feature-flags": { useFeatureFlag: () => false },
    "@/components/organization/organization-access-page": { OrganizationAccessPage: AccessPage, OrganizationAccessSkeleton: Skeleton },
    "@/components/app-sidebar": { Sidebar: unusedComponent },
    "@/components/product-sub-sidebar": { ProductSubSidebar: unusedComponent },
    "@/components/mobile-bottom-nav": { MobileBottomNav: unusedComponent },
    "@/components/workspace-topbar": { WorkspaceTopbar: unusedComponent },
    "@/components/mobile-nav-sheet": { MobileNavSheet: unusedComponent },
    "@/components/agent/agent-chat-provider": { AgentChatProvider: unusedComponent },
    "@/components/agent/agent-chat-host": { AgentChatHost: unusedComponent },
    "@/components/ui/workspace-scope": { workspaceScopeClassName: "workspace" },
    "../../../../shared/instance-config": { instanceProductForPath: () => null },
    "@/lib/documentation-routing": { parseOrganizationRouteParams: (params: object) => params },
  });
  return Component;
}

for (const initialOrganizations of [[], [existingOrganization]]) {
  test(`creating ${initialOrganizations.length ? "another" : "the first"} organization refreshes membership before entering setup`, async () => {
    const controller = await onboardingController(initialOrganizations);
    const submit = controller.submit();
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(controller.navigations.length, 0, "wait for fresh membership instead of navigating against a stale cache");
    assert.deepEqual(controller.events, ["create", "set-active", "refresh-organizations"]);
    assert.ok(controller.listSubscriptions > 0, "keep the organization query mounted throughout creation");
    const Dashboard = await dashboardComponent(controller.list);
    assert.equal(Dashboard().type, Skeleton, "cached membership must not deny access while the new organization is loading");

    controller.finishRefetch();
    await submit;
    assert.deepEqual(controller.events, ["create", "set-active", "refresh-organizations", "select-organization", "navigate"]);
    assert.equal(controller.navigations.length, 1);
    assert.equal(controller.navigations[0].to, "/$orgSlug/get-started");
    assert.equal(controller.navigations[0].params.orgSlug, createdOrganization.slug);
    assert.equal(Dashboard().type, Outlet, "the refreshed list grants access immediately without a page reload");
  });
}

test("a missing organization shows loading during refresh, then denies access only after membership settles", async () => {
  const list: OrganizationList = { data: [existingOrganization], isPending: false, isRefetching: true, refetch: async () => {} };
  const Dashboard = await dashboardComponent(list);
  assert.equal(Dashboard().type, Skeleton);
  list.isRefetching = false;
  const settled = Dashboard();
  assert.equal(settled.type, AccessPage);
  assert.equal(settled.props.orgSlug, createdOrganization.slug);
  assert.equal(settled.props.organizations, list.data);
});

test("an organization already in the cached list remains usable during a background refresh", async () => {
  const list: OrganizationList = { data: [existingOrganization], isPending: false, isRefetching: true, refetch: async () => {} };
  const Dashboard = await dashboardComponent(list, existingOrganization.slug);
  assert.equal(Dashboard().type, Outlet);
});

test("a settled empty membership list still sends the user to workspace creation", async () => {
  const list: OrganizationList = { data: [], isPending: false, isRefetching: false, refetch: async () => {} };
  const Dashboard = await dashboardComponent(list);
  const rendered = Dashboard();
  assert.equal(rendered.type, Navigate);
  assert.equal(rendered.props.to, "/onboarding");
});
