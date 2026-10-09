import publicHosts from "../../../../../shared/public-hosts";
import type { PublicHostEnvironment } from "../../../../../shared/public-hosts";

export const statusDnsTarget = (env?: PublicHostEnvironment): string => publicHosts.canonicalStatusHostname(env);
export const isReservedStatusCustomDomain = (host: string, env?: PublicHostEnvironment): boolean => publicHosts.isReservedStatusCustomDomain(host, env);
