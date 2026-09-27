import { animate } from "motion";

const MOBILE_BREAKPOINT = "(max-width: 620px)";
const OUTER_RADIUS = 40;
const NECK_RADIUS = 64;

type OutlineShape = {
  tabLeft: number;
  tabRight: number;
  tabTop: number;
  tabRadius: number;
  leftNeck: number;
  rightNeck: number;
  leftOuterRadius: number;
  rightOuterRadius: number;
};

type OutlineBounds = {
  frameWidth: number;
  frameHeight: number;
  stageLeft: number;
  stageTop: number;
  stageRight: number;
  stageBottom: number;
  outerRadius: number;
};

const coordinate = (value: number) => Number(value.toFixed(2));
const interpolate = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export function setupProductOutline(
  tabs: HTMLElement,
): (product?: string) => void {
  const frame = tabs.matches("[data-product-outline]")
    ? tabs
    : tabs.querySelector<HTMLElement>("[data-product-outline]");
  const svg = frame?.querySelector<SVGSVGElement>("[data-product-outline-svg]");
  const path = frame?.querySelector<SVGPathElement>("[data-product-outline-path]");
  const stage = frame?.querySelector<HTMLElement>(".product-switcher__stage");
  const buttons = Array.from(
    frame?.querySelectorAll<HTMLButtonElement>("[data-product-tab]") ?? [],
  );
  const pillSurfaces = Array.from(
    frame?.querySelectorAll<HTMLElement>(".product-switcher__pills span") ?? [],
  );

  // Keep the CSS fallback if dimensions cannot be observed or on mobile.
  if (
    !frame ||
    !svg ||
    !path ||
    !stage ||
    buttons.length === 0 ||
    typeof ResizeObserver === "undefined"
  ) {
    return () => {};
  }

  const mobile = window.matchMedia?.(MOBILE_BREAKPOINT);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const initialProduct = buttons.find(
    (button) => button.getAttribute("aria-selected") === "true",
  )?.dataset.productTab;
  let selectedProduct = initialProduct;
  let position = Math.max(
    0,
    buttons.findIndex((button) => button.dataset.productTab === initialProduct),
  );
  let activated = false;
  let animation: { stop: () => void } | undefined;
  let pendingFrame = 0;
  let geometry: { shapes: OutlineShape[]; bounds: OutlineBounds } | null = null;

  const staticMode = () =>
    mobile?.matches || window.innerWidth <= 620 || reducedMotion?.matches;

  const disableOutline = () => {
    path.removeAttribute("d");
    delete frame.dataset.outlineReady;
  };

  const measure = (
    selected: HTMLButtonElement,
  ): { shape: OutlineShape; bounds: OutlineBounds } | null => {
    if (mobile?.matches || (!mobile && window.innerWidth <= 620)) return null;

    const frameRect = frame.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const tabRect = selected.getBoundingClientRect();
    if (
      frameRect.width <= 0 ||
      frameRect.height <= 0 ||
      stageRect.width <= 0 ||
      stageRect.height <= 0 ||
      tabRect.width <= 0 ||
      tabRect.height <= 0
    ) {
      return null;
    }

    const first = selected === buttons[0];
    const last = selected === buttons[buttons.length - 1];
    const stageLeft = stageRect.left - frameRect.left;
    const stageTop = stageRect.top - frameRect.top;
    const stageRight = stageRect.right - frameRect.left;
    const stageBottom = stageRect.bottom - frameRect.top;
    const tabLeft = first ? stageLeft : tabRect.left - frameRect.left;
    const tabRight = last ? stageRight : tabRect.right - frameRect.left;
    const tabTop = tabRect.top - frameRect.top;
    const tabRise = stageTop - tabTop;
    const outerRadius = Math.min(
      OUTER_RADIUS,
      stageRect.width / 2,
      stageRect.height / 2,
    );
    const tabRadius = Math.min(OUTER_RADIUS, (tabRight - tabLeft) / 2, tabRise);
    const neckHeight = tabRise - tabRadius;
    const leftNeck = first
      ? 0
      : Math.min(NECK_RADIUS, neckHeight, tabLeft - stageLeft - outerRadius);
    const rightNeck = last
      ? 0
      : Math.min(NECK_RADIUS, neckHeight, stageRight - outerRadius - tabRight);

    if (
      tabRadius <= 0 ||
      outerRadius <= 0 ||
      (!first && leftNeck <= 0) ||
      (!last && rightNeck <= 0)
    ) {
      return null;
    }

    return {
      shape: {
        tabLeft,
        tabRight,
        tabTop,
        tabRadius,
        leftNeck,
        rightNeck,
        leftOuterRadius: first ? 0 : outerRadius,
        rightOuterRadius: last ? 0 : outerRadius,
      },
      bounds: {
        frameWidth: frameRect.width,
        frameHeight: frameRect.height,
        stageLeft,
        stageTop,
        stageRight,
        stageBottom,
        outerRadius,
      },
    };
  };

  const render = (shape: OutlineShape, bounds: OutlineBounds) => {
    const {
      stageLeft,
      stageTop,
      stageRight,
      stageBottom,
      outerRadius,
    } = bounds;
    const {
      tabLeft,
      tabRight,
      tabTop,
      tabRadius,
      leftNeck,
      rightNeck,
      leftOuterRadius,
      rightOuterRadius,
    } = shape;
    const p = (...values: number[]) => values.map(coordinate).join(" ");

    // A single closed path keeps the selected cap visually joined to the stage.
    const commands = [
      `M ${p(stageLeft + leftOuterRadius, stageTop)}`,
      `L ${p(tabLeft - leftNeck, stageTop)}`,
      `A ${p(leftNeck, leftNeck)} 0 0 0 ${p(tabLeft, stageTop - leftNeck)}`,
      `L ${p(tabLeft, tabTop + tabRadius)}`,
      `A ${p(tabRadius, tabRadius)} 0 0 1 ${p(tabLeft + tabRadius, tabTop)}`,
      `L ${p(tabRight - tabRadius, tabTop)}`,
      `A ${p(tabRadius, tabRadius)} 0 0 1 ${p(tabRight, tabTop + tabRadius)}`,
      `L ${p(tabRight, stageTop - rightNeck)}`,
      `A ${p(rightNeck, rightNeck)} 0 0 0 ${p(tabRight + rightNeck, stageTop)}`,
      `L ${p(stageRight - rightOuterRadius, stageTop)}`,
      `A ${p(rightOuterRadius, rightOuterRadius)} 0 0 1 ${p(stageRight, stageTop + rightOuterRadius)}`,
      `L ${p(stageRight, stageBottom - outerRadius)}`,
      `A ${p(outerRadius, outerRadius)} 0 0 1 ${p(stageRight - outerRadius, stageBottom)}`,
      `L ${p(stageLeft + outerRadius, stageBottom)}`,
      `A ${p(outerRadius, outerRadius)} 0 0 1 ${p(stageLeft, stageBottom - outerRadius)}`,
      `L ${p(stageLeft, stageTop + leftOuterRadius)}`,
      `A ${p(leftOuterRadius, leftOuterRadius)} 0 0 1 ${p(stageLeft + leftOuterRadius, stageTop)}`,
      "Z",
    ];

    svg.setAttribute(
      "viewBox",
      `0 0 ${coordinate(bounds.frameWidth)} ${coordinate(bounds.frameHeight)}`,
    );
    path.setAttribute("d", commands.join(" "));
    frame.dataset.outlineReady = "true";
  };

  const renderCurrent = () => {
    if (!geometry) return;
    const { shapes, bounds } = geometry;
    const clamped = Math.max(0, Math.min(position, shapes.length - 1));
    pillSurfaces.forEach((surface, index) => {
      const distance = Math.abs(clamped - index);
      surface.style.opacity = String(
        Math.max(0, Math.min(1, (distance - 0.08) / 0.52)),
      );
    });
    const fromIndex = Math.min(Math.floor(clamped), shapes.length - 2);
    const progress = clamped - fromIndex;
    const from = shapes[fromIndex];
    const to = shapes[fromIndex + 1];
    if (!from || !to) return;

    const shape = Object.fromEntries(
      (Object.keys(from) as (keyof OutlineShape)[]).map((key) => [
        key,
        interpolate(from[key], to[key], progress),
      ]),
    ) as OutlineShape;

    // Keep the shoulders rounded as the cap joins either outer edge.
    const neckHeight = bounds.stageTop - shape.tabTop - shape.tabRadius;
    shape.leftNeck = Math.max(
      0,
      Math.min(
        NECK_RADIUS,
        neckHeight,
        shape.tabLeft - bounds.stageLeft - shape.leftOuterRadius,
      ),
    );
    shape.rightNeck = Math.max(
      0,
      Math.min(
        NECK_RADIUS,
        neckHeight,
        bounds.stageRight - shape.rightOuterRadius - shape.tabRight,
      ),
    );
    render(shape, bounds);
  };

  const draw = () => {
    pendingFrame = 0;
    if (staticMode()) {
      animation?.stop();
      animation = undefined;
      position = Math.max(
        0,
        buttons.findIndex((button) => button.dataset.productTab === selectedProduct),
      );
      geometry = null;
      disableOutline();
      return;
    }

    const measurements = buttons.map(measure);
    if (measurements.some((measurement) => !measurement)) {
      geometry = null;
      disableOutline();
      return;
    }

    geometry = {
      shapes: measurements.map((measurement) => measurement!.shape),
      bounds: measurements[0]!.bounds,
    };
    renderCurrent();
  };

  const scheduleDraw = () => {
    if (!pendingFrame) pendingFrame = window.requestAnimationFrame(draw);
  };

  const resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(frame);
  resizeObserver.observe(stage);
  buttons.forEach((button) => resizeObserver.observe(button));
  mobile?.addEventListener?.("change", scheduleDraw);
  reducedMotion?.addEventListener?.("change", scheduleDraw);
  draw();

  return (product?: string) => {
    const target = buttons.findIndex((button) => button.dataset.productTab === product);
    if (target < 0) return;
    selectedProduct = product;
    animation?.stop();
    animation = undefined;

    if (!activated || staticMode() || !geometry) {
      activated = true;
      position = target;
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
      draw();
      return;
    }

    if (Math.abs(position - target) < 0.001) return;
    animation = animate(position, target, {
      duration: 0.48,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        position = latest;
        renderCurrent();
      },
      onComplete: () => {
        position = target;
        renderCurrent();
        animation = undefined;
      },
    });
  };
}
