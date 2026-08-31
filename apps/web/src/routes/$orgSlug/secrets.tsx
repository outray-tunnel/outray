import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/secrets")({
  component: SecretsLayout,
});

function SecretsLayout() {
  return (
    <div className="ph-no-capture contents" data-private-product="secrets">
      <Outlet />
    </div>
  );
}
