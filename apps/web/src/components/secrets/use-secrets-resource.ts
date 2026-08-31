import { useCallback, useEffect, useRef, useState } from "react";

export interface SecretsResourceState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useSecretsResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: React.DependencyList,
): SecretsResourceState<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const load = async () => {
      setRefreshing(true);
      try {
        const nextData = await loaderRef.current(controller.signal);
        if (disposed) return;
        setData(nextData);
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        if (!disposed) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "This secrets data could not be loaded.",
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
      controller.abort();
    };
    // Consumers control reloading through the dependency list and reloadKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  return { data, loading, refreshing, error, reload, setData };
}
