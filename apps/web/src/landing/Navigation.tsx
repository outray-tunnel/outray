import { ProductIcon } from "./ProductIcon";
import { authClient } from "@/lib/auth-client";

const productLinks = [
  { id: "tunnels", label: "Tunnels", href: "#tunnels", description: "Put a local service on a public URL." },
  { id: "observability", label: "Observability", href: "#observability", description: "Follow requests through traces, logs, and metrics." },
  { id: "secrets", label: "Secrets", href: "#secrets", description: "Deliver encrypted values to every environment." },
  { id: "uptime", label: "Uptime", href: "#uptime", description: "Check endpoints and share service status." },
] as const;

export function Navigation({ loginUrl, signupUrl, docsUrl, githubUrl }: { loginUrl: string; signupUrl: string; docsUrl: string; githubUrl: string }) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const dashboardOrganization = organizations?.find((organization) => organization.id === activeOrganization?.id) ?? organizations?.[0];
  const dashboardUrl = dashboardOrganization ? `/${encodeURIComponent(dashboardOrganization.slug)}` : "/select";

  return (
<header className="site-header" data-site-header>
  <div className="nav-shell page-shell">
    <a className="brand-link" href="#top" aria-label="OutRay home" data-track="navigation" data-track-label="logo">
      <img src="/brand/outray-mark.svg" width="34" height="34" alt="" />
      <span>OutRay</span>
    </a>

    <nav className="desktop-nav" aria-label="Primary navigation">
      <details className="products-menu" data-products-menu data-active-product="tunnels">
        <summary className="products-menu__trigger">
          Products
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
        </summary>
        <div className="products-menu__popover">
          <div className="products-menu__panel">
            <div className="products-menu__links">
              <p className="products-menu__label">Products</p>
              {productLinks.map(({ id, label, href, description }) => (
                <a
                  key={id}
                  className="products-menu__item"
                  href={href}
                  aria-label={label}
                  data-menu-product={id}
                  data-select-product={id}
                  data-target-tabs="showcase"
                  data-track="navigation"
                  data-track-label={id}
                >
                  <span className="products-menu__icon"><ProductIcon product={id} /></span>
                  <span className="products-menu__item-copy"><strong>{label}</strong><small>{description}</small></span>
                  <svg className="products-menu__item-arrow" aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4"></path></svg>
                </a>
              ))}
            </div>
            <div className="products-menu__preview" aria-hidden="true">
              <div className="products-menu__preview-content" data-menu-preview="tunnels">
                <p className="products-menu__preview-kicker">TUNNELS / 01</p>
                <p className="products-menu__preview-title">From local to live.</p>
                <div className="products-menu__terminal">
                  <span><i></i><i></i><i></i></span>
                  <code><span>$</span> outray 3000</code>
                  <div className="products-menu__result"><span>https://orders.outray.app</span><em>Live</em></div>
                </div>
              </div>
              <div className="products-menu__preview-content" data-menu-preview="observability">
                <p className="products-menu__preview-kicker">OBSERVABILITY / 02</p>
                <p className="products-menu__preview-title">See the whole request.</p>
                <div className="products-menu__trace">
                  <div><span>GET /api/orders</span><em>200</em></div>
                  <span className="products-menu__trace-bar products-menu__trace-bar--request"></span>
                  <span className="products-menu__trace-bar products-menu__trace-bar--database"></span>
                  <span className="products-menu__trace-bar products-menu__trace-bar--response"></span>
                </div>
              </div>
              <div className="products-menu__preview-content" data-menu-preview="secrets">
                <p className="products-menu__preview-kicker">SECRETS / 03</p>
                <p className="products-menu__preview-title">Values where they run.</p>
                <div className="products-menu__vault">
                  <div><span>production</span><span>3 secrets</span></div>
                  <p>DATABASE_URL <span>••••••••</span></p>
                  <p>API_KEY <span>••••••••</span></p>
                  <p>WEBHOOK_SECRET <span>••••••••</span></p>
                </div>
              </div>
              <div className="products-menu__preview-content" data-menu-preview="uptime">
                <p className="products-menu__preview-kicker">UPTIME / 04</p>
                <p className="products-menu__preview-title">Know before your users do.</p>
                <div className="products-menu__uptime">
                  <div><span>Current status</span><em>Operational</em></div>
                  <p><span>API</span><i></i></p>
                  <p><span>Dashboard</span><i></i></p>
                  <small>Checks every minute</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
      <ul className="nav-list nav-list--resources">
        <li><a href={docsUrl} data-track="navigation" data-track-label="docs">Docs</a></li>
        <li>
          <a href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="navigation">
            GitHub
          </a>
        </li>
      </ul>
    </nav>

    <div className="nav-actions">
      {isSessionPending ? (
        <span className="nav-auth-placeholder" aria-hidden="true" />
      ) : session?.user ? (
        <a className="button button-primary button-compact" href={dashboardUrl} data-track="cta" data-track-label="nav-dashboard">
          Dashboard
        </a>
      ) : (
        <>
          <a className="text-link" href={loginUrl} data-track="cta" data-track-label="nav-login">Log in</a>
          <a className="button button-primary button-compact" href={signupUrl} data-track="cta" data-track-label="nav-start-free">
            Start free
          </a>
        </>
      )}
    </div>

    <details className="mobile-nav">
      <summary aria-label="Navigation menu">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
        </svg>
        <span className="sr-only">Menu</span>
      </summary>
      <div className="mobile-menu">
        <nav aria-label="Mobile navigation">
          <p className="mobile-menu__label">Products</p>
          <ul className="mobile-menu__products">
            {productLinks.map(({ id, label, href }) => (
              <li key={id}><a href={href} data-select-product={id} data-target-tabs="showcase" data-track="navigation" data-track-label={`mobile-${id}`}>
                <span>{label}</span>
                <svg className="mobile-menu__arrow" aria-hidden="true" viewBox="0 0 20 20"><path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
              </a></li>
            ))}
          </ul>
          <p className="mobile-menu__label">Explore</p>
          <ul className="mobile-menu__resources">
            <li><a href={docsUrl} data-track="navigation" data-track-label="mobile-docs">Docs</a></li>
            <li><a href={githubUrl} target="_blank" rel="noreferrer" data-track="github" data-track-label="mobile-navigation">GitHub</a></li>
          </ul>
        </nav>
        <div className="mobile-menu-actions">
          {!isSessionPending && (session?.user ? (
            <a href={dashboardUrl} data-track="cta" data-track-label="mobile-dashboard">Dashboard <span aria-hidden="true">↗</span></a>
          ) : (
            <a href={loginUrl} data-track="cta" data-track-label="mobile-login">Log in to console <span aria-hidden="true">↗</span></a>
          ))}
        </div>
      </div>
    </details>
  </div>
</header>
  );
}
