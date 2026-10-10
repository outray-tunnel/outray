import type { RequestHandler } from "express";
import type { PublicHostEnvironment } from "../../../shared/public-hosts";
import { normalizeCertificateDomain, statusCertificateDomainAllowed, type CertificateLookup } from "./domain-authorization";

/** Private Caddy ask endpoint. Invalid input, missing bindings and lookup
 * failures all deny certificate issuance; database diagnostics stay private. */
export function statusDomainCheckHandler(
  lookup: CertificateLookup,
  env: PublicHostEnvironment = process.env,
): RequestHandler {
  return async (req, res) => {
    const domain = normalizeCertificateDomain(req.query.domain);
    if (!domain) {
      res.status(400).send();
      return;
    }
    try {
      const allowed = await statusCertificateDomainAllowed(domain, lookup, env);
      res.status(allowed ? 200 : 403).send();
    } catch {
      // Do not log hostnames, SQL, parameters or connection details.
      console.error("Status certificate authorization failed");
      res.status(500).send();
    }
  };
}
