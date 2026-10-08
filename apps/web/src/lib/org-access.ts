import { getCachedAuthSession } from "./auth-session-cache";

type SessionWithUser = { user: { id: string } };

export type OrganizationAccess<Session, Organization> =
  { session: Session; organization: Organization } | { status: 401 | 403 };

/** Deduplicate work only within one Request, never across users or requests. */
export function createOrganizationAccessResolver<
  Session extends SessionWithUser,
  Organization,
>(dependencies: {
  getSession: (request: Request) => Promise<Session | null>;
  findOrganization: (
    userId: string,
    slug: string,
  ) => Promise<Organization | undefined>;
}) {
  const sessions = new WeakMap<Request, Promise<Session | null>>();
  const organizations = new WeakMap<
    Request,
    Map<string, Promise<OrganizationAccess<Session, Organization>>>
  >();

  return (request: Request, slug: string) => {
    let access = organizations.get(request);
    if (!access) {
      access = new Map();
      organizations.set(request, access);
    }
    const existing = access.get(slug);
    if (existing) return existing;

    let session = sessions.get(request);
    if (!session) {
      session = getCachedAuthSession(request, dependencies.getSession);
      sessions.set(request, session);
    }
    const result = session.then(
      async (value): Promise<OrganizationAccess<Session, Organization>> => {
        if (!value) return { status: 401 };
        const organization = await dependencies.findOrganization(
          value.user.id,
          slug,
        );
        if (!organization) return { status: 403 };
        return { session: value, organization };
      },
    );
    access.set(slug, result);
    return result;
  };
}
