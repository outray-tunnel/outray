/** Explicit sslmode=disable supports private Docker networks, not just localhost. */
export function postgresSsl(connectionString: string, rejectUnauthorized = true) {
  const url = new URL(connectionString);
  if (url.searchParams.get("sslmode") === "disable" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
  return { rejectUnauthorized };
}

export default { postgresSsl };
