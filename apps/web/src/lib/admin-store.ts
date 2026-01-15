import { create } from "zustand";

interface AdminStore {
  token: string | null;
  setToken: (token: string | null) => void;
  clearToken: () => void;
}

const TOKEN_STORAGE_KEY = "admin_token";
const TOKEN_ISSUED_AT_KEY = "admin_token_issued_at";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const isBrowser =
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

let tokenExpirationTimeout: ReturnType<typeof setTimeout> | null = null;

const persistToken = (token: string | null) => {
  if (!isBrowser) {
    return;
  }

  if (token === null) {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(TOKEN_ISSUED_AT_KEY);
    return;
  }

  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.sessionStorage.setItem(TOKEN_ISSUED_AT_KEY, Date.now().toString());
};

const clearPersistedToken = () => {
  if (!isBrowser) {
    return;
  }
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(TOKEN_ISSUED_AT_KEY);
};

const loadPersistedToken = (): {
  token: string | null;
  issuedAt: number | null;
} => {
  if (!isBrowser) {
    return { token: null, issuedAt: null };
  }

  const token = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  const issuedAtRaw = window.sessionStorage.getItem(TOKEN_ISSUED_AT_KEY);

  if (!token || !issuedAtRaw) {
    clearPersistedToken();
    return { token: null, issuedAt: null };
  }

  const issuedAt = parseInt(issuedAtRaw, 10);
  if (Number.isNaN(issuedAt)) {
    clearPersistedToken();
    return { token: null, issuedAt: null };
  }

  return { token, issuedAt };
};

const scheduleTokenExpiration = (onExpire: () => void, delayMs: number) => {
  if (tokenExpirationTimeout) {
    clearTimeout(tokenExpirationTimeout);
  }
  tokenExpirationTimeout = setTimeout(() => {
    onExpire();
  }, delayMs);
};

export const useAdminStore = create<AdminStore>((set) => {
  let initialToken: string | null = null;

  const { token: persistedToken, issuedAt } = loadPersistedToken();
  if (persistedToken && issuedAt !== null) {
    const elapsed = Date.now() - issuedAt;
    if (elapsed >= TOKEN_TTL_MS) {
      // Token has already expired; clear it.
      clearPersistedToken();
      initialToken = null;
    } else {
      // Token is still valid; schedule expiration for the remaining time.
      const remainingMs = TOKEN_TTL_MS - elapsed;
      scheduleTokenExpiration(() => {
        clearPersistedToken();
        set({ token: null });
      }, remainingMs);
      initialToken = persistedToken;
    }
  }

  return {
    token: initialToken,
    setToken: (token) => {
      // Cancel any existing expiration timer.
      if (tokenExpirationTimeout) {
        clearTimeout(tokenExpirationTimeout);
        tokenExpirationTimeout = null;
      }

      if (token) {
        // Persist the new token and schedule expiration.
        persistToken(token);
        scheduleTokenExpiration(() => {
          clearPersistedToken();
          set({ token: null });
        }, TOKEN_TTL_MS);
      } else {
        // Clearing the token explicitly.
        clearPersistedToken();
      }

      set({ token });
    },
    clearToken: () => {
      if (tokenExpirationTimeout) {
        clearTimeout(tokenExpirationTimeout);
        tokenExpirationTimeout = null;
      }
      clearPersistedToken();
      set({ token: null });
    },
  };
});
