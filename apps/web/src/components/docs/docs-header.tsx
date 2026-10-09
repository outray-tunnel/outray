import { SidebarTrigger } from "fumadocs-ui/components/sidebar/base";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Menu, Search } from "lucide-react";
import styles from "./docs.module.css";

function DocsSearch() {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  if (!enabled) return null;
  return (
    <button className={styles.search} type="button" aria-label="Search documentation" onClick={() => setOpenSearch(true)}>
      <Search size={15} aria-hidden="true" />
      <span>Search documentation</span>
      <span className={styles.shortcut} aria-hidden="true">{hotKey.map((key, index) => <kbd key={index}>{key.display}</kbd>)}</span>
    </button>
  );
}

export function DocsHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.skipLink} href="#docs-content">Skip to content</a>
      <a className={styles.brand} href="/" aria-label="OutRay home">
        <img src="/brand/outray-mark.svg" alt="" width="28" height="28" />
        <span>OutRay</span>
      </a>
      <span className={styles.divider} aria-hidden="true">/</span>
      <a className={styles.docsLabel} href="/docs">Docs</a>
      <nav className={styles.links} aria-label="Documentation resources">
        <a href="/products">Products</a>
        <a href="https://github.com/outray-tunnel/outray" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
      </nav>
      <div className={styles.actions}>
        <DocsSearch />
        <a className={styles.getStarted} href="/signup">Get started <span aria-hidden="true">↗</span></a>
        <SidebarTrigger className={styles.menu} aria-label="Open documentation navigation">
          <Menu size={19} aria-hidden="true" />
        </SidebarTrigger>
      </div>
    </header>
  );
}
