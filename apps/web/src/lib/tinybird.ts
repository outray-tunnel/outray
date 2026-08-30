interface TinybirdResponse<T> {
  data: T[];
  rows?: number;
  statistics?: {
    elapsed?: number;
    rows_read?: number;
    bytes_read?: number;
  };
}

function tinybirdConfig() {
  const apiHost = process.env.TINYBIRD_API_HOST?.replace(/\/$/, "");
  const token = process.env.TINYBIRD_QUERY_TOKEN;
  if (!apiHost || !token) {
    throw new Error("TINYBIRD_API_HOST and TINYBIRD_QUERY_TOKEN are required");
  }
  return { apiHost, token };
}

export async function queryTinybird<T>(
  endpoint: string,
  parameters: Record<string, string | number | boolean | undefined>,
): Promise<T[]> {
  const { apiHost, token } = tinybirdConfig();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const response = await fetch(
    `${apiHost}/v0/pipes/${encodeURIComponent(endpoint)}.json?${search}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Tinybird query failed (${response.status}): ${detail}`);
  }

  const result = (await response.json()) as TinybirdResponse<T>;
  return result.data || [];
}
