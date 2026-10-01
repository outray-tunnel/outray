import posthog from "posthog-js";
import { setupProductOutline } from "./product-outline";

type OutrayAnalyticsEvent =
  | "navigation_clicked"
  | "cta_clicked"
  | "github_clicked"
  | "product_tab_changed";
type TrackProperties = Record<string, boolean | number | string | null>;

function track(event: OutrayAnalyticsEvent, properties?: TrackProperties) {
  if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) posthog.capture(event, properties);
}

function setupExplicitTracking(signal: AbortSignal) {
  const eventMap: Record<string, OutrayAnalyticsEvent> = {
    navigation: "navigation_clicked",
    cta: "cta_clicked",
    github: "github_clicked",
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>("[data-track]");
    if (!target) return;

    const eventName = eventMap[target.dataset.track ?? ""];
    if (!eventName) return;

    track(eventName, {
      label:
        target.dataset.trackLabel ?? target.textContent?.trim() ?? "unknown",
      href: target instanceof HTMLAnchorElement ? target.href : null,
    });
  }, { signal });
}

function setupShowcasePanels(tabs: HTMLElement, panels: HTMLElement[], signal: AbortSignal) {
  const stage = tabs.querySelector<HTMLElement>(".product-switcher__stage");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let activePanel: HTMLElement | undefined;
  let finishTimer = 0;
  let heightFrame = 0;

  signal.addEventListener("abort", () => {
    window.clearTimeout(finishTimer);
    window.cancelAnimationFrame(heightFrame);
  }, { once: true });

  return (product: string) => {
    const next = panels.find((panel) => panel.dataset.productPanel === product);
    if (!next || next === activePanel) return;

    const animate = Boolean(activePanel && stage && !reducedMotion?.matches);
    const startHeight = animate && stage ? stage.getBoundingClientRect().height : 0;
    window.clearTimeout(finishTimer);
    window.cancelAnimationFrame(heightFrame);
    if (stage) {
      stage.style.height = "";
      delete stage.dataset.switching;
    }

    for (const panel of panels) {
      const selected = panel === next;
      panel.hidden = !selected;
      panel.dataset.active = String(selected);
      panel.inert = !selected;
    }
    activePanel = next;

    if (!animate || !stage) return;
    stage.dataset.switching = "true";

    const style = window.getComputedStyle(stage);
    const borderHeight =
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    const minHeight = Number.parseFloat(style.minHeight) || 0;
    const targetHeight = Math.max(
      next.getBoundingClientRect().height + borderHeight,
      minHeight,
    );

    if (Math.abs(targetHeight - startHeight) > 1) {
      stage.style.height = `${startHeight}px`;
      // Commit the starting height before easing to the new content height.
      void stage.offsetHeight;
      heightFrame = window.requestAnimationFrame(() => {
        stage.style.height = `${targetHeight}px`;
      });
    }

    finishTimer = window.setTimeout(() => {
      stage.style.height = "";
      delete stage.dataset.switching;
    }, 240);
  };
}

function setupProductTabs(signal: AbortSignal) {
  const controllers = new Map<
    string,
    (product: string, focus?: boolean) => boolean
  >();

  document
    .querySelectorAll<HTMLElement>("[data-product-tabs]")
    .forEach((tabs) => {
      const tabButtons = Array.from(
        tabs.querySelectorAll<HTMLButtonElement>("[data-product-tab]"),
      );
      const panels = Array.from(
        tabs.querySelectorAll<HTMLElement>("[data-product-panel]"),
      );
      const group = tabs.dataset.tabGroup ?? `tabs-${controllers.size + 1}`;
      const updateOutline =
        group === "showcase" ? setupProductOutline(tabs, signal) : undefined;
      const updateShowcasePanels =
        group === "showcase" ? setupShowcasePanels(tabs, panels, signal) : undefined;

      const setActive = (product: string, focus = false) => {
        const activeButton = tabButtons.find(
          (button) => button.dataset.productTab === product,
        );
        if (!activeButton) return false;
        const focusedPanel = panels.find((panel) =>
          panel.contains(document.activeElement),
        );
        if (
          group === "showcase" &&
          focusedPanel &&
          focusedPanel.dataset.productPanel !== product
        ) {
          activeButton.focus();
        }

        for (const button of tabButtons) {
          const active = button === activeButton;
          button.setAttribute("aria-selected", String(active));
          button.tabIndex = active ? 0 : -1;
        }

        if (updateShowcasePanels) {
          updateShowcasePanels(product);
        } else {
          for (const panel of panels) {
            const active = panel.dataset.productPanel === product;
            panel.hidden = !active;
            panel.dataset.active = String(active);
          }
        }

        updateOutline?.(product);
        if (focus) activeButton.focus();
        return true;
      };

      controllers.set(group, setActive);
      tabs.dataset.enhanced = "true";
      const hashProduct =
        group === "showcase" ? window.location.hash.slice(1) : "";
      if (!hashProduct || !setActive(hashProduct)) {
        setActive(
          tabs.dataset.defaultTab ??
            tabButtons[0]?.dataset.productTab ??
            "tunnels",
        );
      }

      tabButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
          const product = button.dataset.productTab;
          if (!product) return;
          setActive(product);
          track("product_tab_changed", { product });
        }, { signal });

        button.addEventListener("keydown", (event) => {
          let nextIndex: number | undefined;
          if (event.key === "ArrowRight")
            nextIndex = (index + 1) % tabButtons.length;
          if (event.key === "ArrowLeft")
            nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
          if (event.key === "Home") nextIndex = 0;
          if (event.key === "End") nextIndex = tabButtons.length - 1;
          if (nextIndex === undefined) return;

          event.preventDefault();
          const product = tabButtons[nextIndex]?.dataset.productTab;
          if (product) {
            setActive(product, true);
            track("product_tab_changed", { product, input: "keyboard" });
          }
        }, { signal });
      });
    });

  window.addEventListener("hashchange", () => {
    const product = window.location.hash.slice(1);
    if (product) controllers.get("showcase")?.(product);
  }, { signal });
}

function setupHeader(signal: AbortSignal) {
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  if (!header) return;

  const update = () => {
    header.dataset.scrolled = String(window.scrollY > 16);
  };

  update();
  window.addEventListener("scroll", update, { passive: true, signal });

  const productsMenu = header.querySelector<HTMLDetailsElement>("[data-products-menu]");
  if (productsMenu) {
    const trigger = productsMenu.querySelector<HTMLElement>("summary");
    const hasHover = window.matchMedia("(hover: hover) and (pointer: fine)");

    productsMenu.addEventListener("pointerenter", (event) => {
      if (hasHover.matches && event.pointerType === "mouse") productsMenu.open = true;
    }, { signal });

    productsMenu.addEventListener("pointerleave", (event) => {
      if (hasHover.matches && event.pointerType === "mouse") productsMenu.open = false;
    }, { signal });

    trigger?.addEventListener("click", (event) => {
      if (hasHover.matches && event.detail > 0 && productsMenu.open) {
        event.preventDefault();
      }
    }, { signal });

    productsMenu.querySelectorAll<HTMLAnchorElement>("[data-menu-product]").forEach((link) => {
      const activate = () => {
        productsMenu.dataset.activeProduct = link.dataset.menuProduct;
      };

      link.addEventListener("pointerenter", activate, { signal });
      link.addEventListener("focus", activate, { signal });
      link.addEventListener("click", () => {
        productsMenu.open = false;
      }, { signal });
    });

    productsMenu.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !productsMenu.open) return;
      productsMenu.open = false;
      trigger?.focus();
    }, { signal });

    productsMenu.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && !productsMenu.contains(event.relatedTarget)) {
        productsMenu.open = false;
      }
    }, { signal });

    document.addEventListener("pointerdown", (event) => {
      if (productsMenu.open && event.target instanceof Node && !productsMenu.contains(event.target)) {
        productsMenu.open = false;
      }
    }, { signal });
  }

  document
    .querySelectorAll<HTMLDetailsElement>(".mobile-nav")
    .forEach((menu) => {
      menu
        .querySelectorAll("a")
        .forEach((link) =>
          link.addEventListener("click", () => menu.removeAttribute("open"), { signal }),
        );

      menu.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !menu.open) return;
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }, { signal });

      document.addEventListener("pointerdown", (event) => {
        if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
          menu.open = false;
        }
      }, { signal });
    });
}

export function initLandingInteractions() {
  const controller = new AbortController();
  document.documentElement.classList.add("js");
  setupExplicitTracking(controller.signal);
  setupProductTabs(controller.signal);
  setupHeader(controller.signal);
  return () => {
    controller.abort();
    document.documentElement.classList.remove("js");
  };
}
