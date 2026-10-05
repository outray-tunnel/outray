import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { HttpRequestsContent } from "@/components/observability/http-requests-content";
import { HttpRequestInspector } from "@/components/observability/http-request-inspector";
import { parseHttpRequestsSearch, type HttpRequestsSearch } from "@/components/observability/http-requests-search";
import type {
  CachedRequestFacets,
  CaptureFilter,
  HttpRequestSummary,
  RequestCursor,
  RequestFacets,
  RequestsResponse,
  StatusFilter,
} from "@/components/observability/http-requests-data";

export const Route = createFileRoute("/$orgSlug/observability/requests")({
  head: () => ({ meta: [{ title: "Requests - OutRay Observability" }] }),
  validateSearch: parseHttpRequestsSearch,
  component: RequestsView,
});

const PAGE_SIZE = 50;
const FACET_REFRESH_INTERVAL = 60_000;

function requestScopeKey(orgSlug: string, filters: HttpRequestsSearch) {
  return JSON.stringify([
    orgSlug, filters.search ?? "", filters.service ?? "", filters.method ?? "all",
    filters.status ?? "all", filters.capture ?? "all", filters.range ?? "1h",
  ]);
}

function RequestsView() {
  const { orgSlug } = Route.useParams();
  return <OrganizationHttpRequestsView key={orgSlug} orgSlug={orgSlug} />;
}

function OrganizationHttpRequestsView({ orgSlug }: { orgSlug: string }) {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = filters.search ?? "";
  const service = filters.service ?? "";
  const method = filters.method ?? "all";
  const status = filters.status ?? "all";
  const capture = filters.capture ?? "all";
  const timeRange = filters.range ?? "1h";
  const scopeKey = requestScopeKey(orgSlug, filters);
  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const pendingNavigation = useRef<string | null>(null);
  const [searchInput, setSearchInput] = useState(query);
  const [previousQuery, setPreviousQuery] = useState(query);
  const [isLive, setIsLive] = useState(true);
  const [cursorStack, setCursorStack] = useState<Array<RequestCursor | null>>([
    null,
  ]);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [selected, setSelected] = useState<HttpRequestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [knownTotal, setKnownTotal] = useState(0);
  const [facets, setFacets] = useState<RequestFacets>({
    services: [],
    methods: [],
  });
  const [activeScope, setActiveScope] = useState(scopeKey);
  const facetCache = useRef(new Map<string, CachedRequestFacets>());
  const facetAttempts = useRef(new Map<string, number>());
  const scopeChanging = activeScope !== scopeKey;
  // A new URL scope must never fetch using a previous filter's page cursor.
  const currentCursor = scopeChanging ? null : cursorStack.at(-1) || null;
  const page = scopeChanging ? 0 : cursorStack.length - 1;

  // External navigation restores the search field without wiping a pending
  // local search when a different menu filter changes concurrently.
  if (previousQuery !== query) {
    setPreviousQuery(query);
    setSearchInput(query);
  }

  useEffect(() => {
    if (!scopeChanging) return;
    // Menu changes keep an uncommitted draft; browser navigation restores the
    // destination URL instead of letting an old debounce replace it later.
    if (pendingNavigation.current !== scopeKey) setSearchInput(query);
    pendingNavigation.current = null;
    setActiveScope(scopeKey);
    setData(null);
    setLoading(true);
    setError(null);
    setCursorStack([null]);
    setKnownTotal(0);
    setSelected(null);
    setLastSuccessAt(null);
  }, [query, scopeChanging, scopeKey]);

  useEffect(() => {
    if (searchInput.trim() === query) return;

    const timeout = window.setTimeout(() => {
      void navigate({
        search: (previous) => {
          const next = parseHttpRequestsSearch({ ...previous, search: searchInput });
          pendingNavigation.current = requestScopeKey(orgSlug, next);
          return next;
        },
        replace: true,
        resetScroll: false,
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [navigate, orgSlug, query, searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let requestGeneration = 0;
    let refreshTimeout: number | undefined;
    let activeFacetAttempt: number | undefined;
    const facetKey = `${orgSlug}:${timeRange}`;
    const facetEntries = facetCache.current;
    const facetAttemptEntries = facetAttempts.current;
    const cachedFacets = facetEntries.get(facetKey);
    setFacets(cachedFacets || { services: [], methods: [] });
    const parameters = new URLSearchParams({
      range: timeRange,
      limit: String(PAGE_SIZE),
    });
    if (query.trim()) parameters.set("search", query.trim());
    if (service) parameters.set("service", service);
    if (method !== "all") parameters.set("method", method);
    if (status !== "all") parameters.set("status", status);
    if (capture !== "all") parameters.set("capture", capture);
    if (currentCursor) {
      parameters.set("before_timestamp", currentCursor.timestamp);
      parameters.set("before_trace_id", currentCursor.traceId);
      parameters.set("before_span_id", currentCursor.spanId);
    }

    const facetsAreDue = () => {
      const lastSuccess = facetEntries.get(facetKey)?.refreshedAt || 0;
      const lastAttempt = facetAttemptEntries.get(facetKey) || 0;
      return (
        Date.now() - Math.max(lastSuccess, lastAttempt) >=
        FACET_REFRESH_INTERVAL
      );
    };

    const loadRequests = async (includeFacets: boolean) => {
      const generation = ++requestGeneration;
      setRefreshing(true);
      try {
        const requestParameters = new URLSearchParams(parameters);
        if (includeFacets) {
          activeFacetAttempt = Date.now();
          facetAttemptEntries.set(facetKey, activeFacetAttempt);
        } else {
          requestParameters.set("include_facets", "false");
        }
        const response = await fetch(
          `/api/${encodeURIComponent(orgSlug)}/observability/requests?${requestParameters}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Could not load requests");

        const nextData = (await response.json()) as RequestsResponse;
        if (disposed || generation !== requestGeneration) return;
        setData(nextData);
        if (nextData.services && nextData.methods) {
          const nextFacets = {
            services: nextData.services,
            methods: nextData.methods,
            refreshedAt: Date.now(),
          };
          facetEntries.set(facetKey, nextFacets);
          if (facetAttemptEntries.get(facetKey) === activeFacetAttempt) {
            facetAttemptEntries.delete(facetKey);
          }
          setFacets(nextFacets);
        }
        if (includeFacets) activeFacetAttempt = undefined;
        setKnownTotal(nextData.total);
        setSelected((current) => {
          if (!current) return null;
          return (
            nextData.requests.find((request) => request.id === current.id) ||
            current
          );
        });
        setLastSuccessAt(Date.now());
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        if (includeFacets) activeFacetAttempt = undefined;
        if (disposed || generation !== requestGeneration) return;
        setError("Request telemetry is temporarily unavailable.");
      } finally {
        if (!disposed && generation === requestGeneration) {
          setLoading(false);
          setRefreshing(false);
          if (isLive) {
            refreshTimeout = window.setTimeout(
              () => void loadRequests(facetsAreDue()),
              4_000,
            );
          }
        }
      }
    };

    void loadRequests(facetsAreDue());
    return () => {
      disposed = true;
      requestGeneration += 1;
      if (
        activeFacetAttempt !== undefined &&
        facetAttemptEntries.get(facetKey) === activeFacetAttempt
      ) {
        facetAttemptEntries.delete(facetKey);
      }
      controller.abort();
      if (refreshTimeout !== undefined) {
        window.clearTimeout(refreshTimeout);
      }
    };
  }, [
    capture,
    currentCursor,
    isLive,
    method,
    orgSlug,
    page,
    query,
    reloadKey,
    service,
    status,
    timeRange,
  ]);

  const closeInspector = useCallback(() => setSelected(null), []);
  const displayTotal = scopeChanging ? 0 : data?.total ?? knownTotal;

  function beginQuery(resetPagination = true) {
    setData(null);
    setLoading(true);
    setError(null);
    if (resetPagination) {
      setCursorStack([null]);
      setKnownTotal(0);
    }
  }

  function changeQuery(value: string) {
    setSearchInput(value);
  }

  function changeFilters(next: Partial<HttpRequestsSearch>) {
    void navigate({
      search: (previous) => {
        const nextSearch = parseHttpRequestsSearch({ ...previous, ...next });
        const nextScope = requestScopeKey(orgSlug, nextSearch);
        pendingNavigation.current = nextScope === scopeKey ? null : nextScope;
        return nextSearch;
      },
      replace: true,
      resetScroll: false,
    });
  }

  function changeService(value: string) {
    if (value === service) return;
    changeFilters({ service: value });
  }

  function changeMethod(value: string) {
    if (value === method) return;
    changeFilters({ method: value });
  }

  function changeStatus(value: StatusFilter) {
    if (value === status) return;
    changeFilters({ status: value });
  }

  function changeCapture(value: string) {
    if (value === capture) return;
    changeFilters({ capture: value as CaptureFilter });
  }

  function changeTimeRange(value: string) {
    if (value === timeRange) return;
    changeFilters({ range: parseHttpRequestsSearch({ range: value }).range });
  }

  function nextPage() {
    if (!data?.hasMore || !data.nextCursor) return;
    beginQuery(false);
    setCursorStack((current) => [...current, data.nextCursor]);
  }

  function previousPage() {
    if (page === 0) return;
    beginQuery(false);
    setCursorStack((current) => current.slice(0, -1));
  }

  function retryRequests() {
    if (!data) setLoading(true);
    setError(null);
    setReloadKey((value) => value + 1);
  }

  function resetFilters() {
    beginQuery();
    // Clearing a search before its debounce commits still needs a fresh load.
    setReloadKey((value) => value + 1);
    setSearchInput("");
    setSelected(null);
    void navigate({
      search: (previous) => {
        const next = parseHttpRequestsSearch({ range: previous.range });
        const nextScope = requestScopeKey(orgSlug, next);
        pendingNavigation.current = nextScope === scopeKey ? null : nextScope;
        return next;
      },
      replace: true,
      resetScroll: false,
    });
  }

  return (
    <>
      <HttpRequestsContent
        orgSlug={orgSlug}
        data={scopeChanging ? null : data}
        loading={scopeChanging || loading}
        refreshing={refreshing || searchInput.trim() !== query}
        error={scopeChanging ? null : error}
        lastSuccessAt={scopeChanging ? null : lastSuccessAt}
        search={scopeChanging && pendingNavigation.current !== scopeKey ? query : searchInput}
        service={service}
        method={method}
        status={status}
        capture={capture}
        range={timeRange}
        live={isLive}
        facets={facets}
        selectedId={scopeChanging ? undefined : selected?.id}
        page={page}
        total={displayTotal}
        onSearchChange={changeQuery}
        onServiceChange={changeService}
        onMethodChange={changeMethod}
        onStatusChange={changeStatus}
        onCaptureChange={changeCapture}
        onRangeChange={changeTimeRange}
        onToggleLive={() => setIsLive((value) => !value)}
        onRetry={retryRequests}
        onResetFilters={resetFilters}
        onNextPage={nextPage}
        onPreviousPage={previousPage}
        onInspect={(request, trigger) => {
          inspectorTrigger.current = trigger ?? null;
          setSelected(request);
        }}
      />
      <HttpRequestInspector
        request={scopeChanging ? null : selected}
        orgSlug={orgSlug}
        onClose={closeInspector}
        returnFocusRef={inspectorTrigger}
      />
    </>
  );
}
