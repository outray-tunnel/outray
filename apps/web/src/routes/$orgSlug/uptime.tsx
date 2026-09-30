import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/$orgSlug/uptime")({
  component: UptimeLayout,
});

function UptimeLayout() {
  const { orgSlug } = Route.useParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Query's visibility-change refresh does not cover switching between visible windows.
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void queryClient.refetchQueries({ queryKey: ["uptime", orgSlug], type: "active" }, { cancelRefetch: false });
      }
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [orgSlug, queryClient]);

  return <Outlet />;
}
