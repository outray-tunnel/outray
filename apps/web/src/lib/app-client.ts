import axios from "axios";

const apiClient = axios.create({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  headers: {
    "Content-Type": "application/json",
  },
});

export interface Tunnel {
  id: string;
  url: string;
  userId: string;
  name: string | null;
  protocol: "http" | "tcp" | "udp";
  remotePort: number | null;
  isOnline: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  id: string;
  userId: string;
  token: string;
  name: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface Subdomain {
  id: string;
  subdomain: string;
  organizationId: string;
  userId: string;
  createdAt: Date;
}

export interface Domain {
  id: string;
  domain: string;
  organizationId: string;
  userId: string;
  status: "pending" | "active" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  plan: string;
  usage?: {
    tunnels?: number;
    domains?: number;
    subdomains?: number;
    members?: number;
  };
  [key: string]: any;
}

interface CreateAuthTokenParams {
  name: string;
  orgSlug: string;
}

interface DeleteAuthTokenParams {
  id: string;
  orgSlug: string;
}

interface CreateDomainParams {
  domain: string;
  orgSlug: string;
}

type SuccessResponse<T> = T;
type ErrorResponse = { error: string; details?: string };
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// Helper function to handle API calls with consistent error handling
async function apiCall<T = any>(
  method: "get" | "post" | "patch" | "delete",
  url: string,
  options?: { params?: any; data?: any; headers?: Record<string, string> },
): Promise<ApiResponse<T>> {
  try {
    let response;
    if (method === "get" || method === "delete") {
      response = await apiClient[method](url, {
        params: options?.params,
        data: options?.data,
        headers: options?.headers,
      });
    } else {
      response = await apiClient[method](url, options?.data, {
        params: options?.params,
        headers: options?.headers,
      });
    }
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data;
    }
    return { error: "An unexpected error occurred" };
  }
}

export const appClient = {
  admin: {
    stats: async (period: string, token: string) =>
      apiCall<any[]>("get", `/api/admin/stats`, {
        params: { period },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),

    login: async (phrase: string) =>
      apiCall<{ token: string }>("post", `/api/admin/login`, {
        data: { phrase },
      }),

    overview: async (token: string) =>
      apiCall<{
        users: { total: number; growth: number; newToday: number };
        organizations: { total: number; growth: number };
        tunnels: { active: number; total: number };
        subscriptions: {
          byPlan: Record<string, number>;
          mrr: number;
        };
      }>("get", `/api/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      }),

    users: async (
      token: string,
      params: { page?: number; limit?: number; search?: string },
    ) =>
      apiCall<{
        users: Array<{
          id: string;
          name: string;
          email: string;
          emailVerified: boolean;
          image: string | null;
          createdAt: Date;
          orgCount: number;
          lastActive: Date | null;
        }>;
        total: number;
        page: number;
        totalPages: number;
      }>("get", `/api/admin/users`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      }),

    organizations: async (
      token: string,
      params: { page?: number; limit?: number; search?: string },
    ) =>
      apiCall<{
        organizations: Array<{
          id: string;
          name: string;
          slug: string;
          logo: string | null;
          createdAt: Date;
          memberCount: number;
          activeTunnels: number;
          subscription: { plan: string; status: string };
        }>;
        total: number;
        page: number;
        totalPages: number;
      }>("get", `/api/admin/organizations`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      }),

    subscriptions: async (
      token: string,
      params: { page?: number; limit?: number; plan?: string },
    ) =>
      apiCall<{
        subscriptions: Array<{
          id: string;
          organizationId: string;
          plan: string;
          status: string;
          currentPeriodEnd: Date | null;
          cancelAtPeriodEnd: boolean;
          createdAt: Date;
          updatedAt: Date;
          orgName: string | null;
          orgSlug: string | null;
        }>;
        total: number;
        page: number;
        totalPages: number;
        stats: {
          mrr: number;
          arr: number;
          totalActive: number;
          totalCancelled: number;
          activeByPlan: Record<string, number>;
          recentChanges: number;
        };
      }>("get", `/api/admin/subscriptions`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      }),

    tunnels: async (
      token: string,
      params: {
        page?: number;
        limit?: number;
        search?: string;
        protocol?: string;
        active?: boolean;
      },
    ) =>
      apiCall<{
        tunnels: Array<{
          id: string;
          url: string;
          name: string | null;
          protocol: string;
          remotePort: number | null;
          lastSeenAt: Date | null;
          createdAt: Date;
          userName: string | null;
          userEmail: string | null;
          orgName: string | null;
          orgSlug: string | null;
          isOnline: boolean;
        }>;
        total: number;
        page: number;
        totalPages: number;
        stats: {
          total: number;
          active: number;
          byProtocol: Record<string, number>;
        };
      }>("get", `/api/admin/tunnels`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      }),

    charts: async (token: string) =>
      apiCall<{
        userSignups: Array<{ date: string; count: number }>;
        orgGrowth: Array<{ date: string; count: number }>;
        subChanges: Array<{ date: string; plan: string; count: number }>;
        protocolDist: Array<{ protocol: string; count: number }>;
        hourlyRequests: Array<{ hour: string; requests: number }>;
        verificationStatus: Array<{ verified: boolean; count: number }>;
        subStatus: Array<{ status: string; count: number }>;
        topOrgsByTunnels: Array<{
          orgId: string;
          orgName: string;
          tunnelCount: number;
        }>;
        weeklyTunnelTrend: Array<{ day: string; avg: number; max: number }>;
        cumulativeGrowth: Array<{ date: string; total: number }>;
      }>("get", `/api/admin/charts`, {
        headers: { Authorization: `Bearer ${token}` },
      }),

    organization: async (token: string, slug: string) =>
      apiCall<{
        organization: {
          id: string;
          name: string;
          slug: string;
          logo: string | null;
          createdAt: Date;
        };
        subscription: {
          id?: string;
          plan: string;
          status: string;
          polarCustomerId?: string | null;
          polarSubscriptionId?: string | null;
          currentPeriodEnd?: Date | null;
          cancelAtPeriodEnd?: boolean;
        };
        stats: {
          members: number;
          activeTunnels: number;
          totalTunnels: number;
          subdomains: number;
          domains: number;
        };
        members: Array<{
          id: string;
          userId: string;
          role: string;
          createdAt: Date;
        }>;
      }>("get", `/api/admin/organizations/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),

    updateOrganization: async (
      token: string,
      slug: string,
      data: { name?: string; slug?: string; plan?: string; status?: string },
    ) =>
      apiCall<{ success: boolean }>(
        "patch",
        `/api/admin/organizations/${slug}`,
        {
          data,
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
  },

  cli: {
    complete: async (code: string) =>
      apiCall<{ success?: boolean }>("post", `/api/cli/complete`, {
        data: { code },
      }),
  },

  organizations: {
    checkSlug: async (slug: string) =>
      apiCall<{ available: boolean; reason?: "reserved" | "taken" }>(
        "post",
        `/api/organizations/check-slug`,
        {
          data: { slug },
        },
      ),
  },

  tunnels: {
    list: async (orgSlug: string) =>
      apiCall<{ tunnels: Tunnel[] }>("get", `/api/${orgSlug}/tunnels`),

    get: async (orgSlug: string, tunnelId: string) =>
      apiCall<{ tunnel: Tunnel }>("get", `/api/${orgSlug}/tunnels/${tunnelId}`),

    stop: async (orgSlug: string, tunnelId: string) =>
      apiCall<{ message: string }>(
        "post",
        `/api/${orgSlug}/tunnels/${tunnelId}/stop`,
      ),
  },

  authTokens: {
    list: async (orgSlug: string) =>
      apiCall<{ tokens: AuthToken[] }>("get", `/api/${orgSlug}/auth-tokens`),

    create: async ({ name, orgSlug }: CreateAuthTokenParams) =>
      apiCall<{ token: string }>("post", `/api/${orgSlug}/auth-tokens`, {
        data: { name },
      }),

    delete: async ({ id, orgSlug }: DeleteAuthTokenParams) =>
      apiCall<{ success: boolean }>("delete", `/api/${orgSlug}/auth-tokens`, {
        data: { id },
      }),
  },

  subdomains: {
    list: async (orgSlug: string) =>
      apiCall<{ subdomains: Subdomain[] }>("get", `/api/${orgSlug}/subdomains`),

    create: async (params: { subdomain: string; orgSlug: string }) =>
      apiCall<{ subdomain: Subdomain }>(
        "post",
        `/api/${params.orgSlug}/subdomains`,
        {
          data: { subdomain: params.subdomain },
        },
      ),

    delete: async (orgSlug: string, id: string) =>
      apiCall<{ success: boolean }>(
        "delete",
        `/api/${orgSlug}/subdomains/${id}`,
      ),
  },

  domains: {
    list: async (orgSlug: string) =>
      apiCall<{ domains: Domain[] }>("get", `/api/${orgSlug}/domains`),

    create: async (params: CreateDomainParams) =>
      apiCall<{ domain: Domain }>("post", `/api/${params.orgSlug}/domains`, {
        data: { domain: params.domain },
      }),

    delete: async (orgSlug: string, domainId: string) =>
      apiCall<{ message: string }>(
        "delete",
        `/api/${orgSlug}/domains/${domainId}`,
      ),

    verify: async (orgSlug: string, domainId: string) =>
      apiCall<{ verified: boolean; message?: string }>(
        "post",
        `/api/${orgSlug}/domains/${domainId}/verify`,
      ),
  },

  stats: {
    overview: async (orgSlug: string, range: string = "24h") =>
      apiCall<{
        totalRequests: number;
        requestsChange: number;
        activeTunnels: number | null;
        activeTunnelsChange: number;
        totalDataTransfer: number;
        dataTransferChange: number;
        chartData: Array<{ hour: string; requests: number }>;
      }>("get", `/api/${orgSlug}/stats/overview`, {
        params: { range },
      }),

    tunnel: async (orgSlug: string, tunnelId: string, range: string = "24h") =>
      apiCall<{
        stats: {
          totalRequests: number;
          avgDuration: number;
          totalBandwidth: number;
          errorRate: number;
        };
        chartData: Array<{ time: string; requests: number; duration: number }>;
        requests: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          duration: number;
          time: string;
          size: number;
        }>;
      }>("get", `/api/${orgSlug}/stats/tunnel`, {
        params: { tunnelId, range },
      }),

    bandwidth: async (orgSlug: string) =>
      apiCall<{
        usage: number;
        limit: number;
        percentage: number;
      }>("get", `/api/${orgSlug}/stats/bandwidth`),

    protocol: async (
      orgSlug: string,
      params: { tunnelId: string; range: string },
    ) =>
      apiCall<{ stats: any; chartData: any; recentEvents: any[] }>(
        "get",
        `/api/${orgSlug}/stats/protocol`,
        { params },
      ),
  },

  requests: {
    list: async (
      orgSlug: string,
      params: {
        tunnelId?: string;
        range: string;
        limit?: number;
        search?: string;
      },
    ) =>
      apiCall<{ requests: any[] }>("get", `/api/${orgSlug}/requests`, {
        params,
      }),
  },

  subscriptions: {
    get: async (orgSlug: string) =>
      apiCall<{ subscription: Subscription; usage?: Subscription["usage"] }>(
        "get",
        `/api/${orgSlug}/subscriptions`,
      ),
  },
};
