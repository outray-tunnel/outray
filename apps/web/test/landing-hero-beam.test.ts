import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { HeroBeam } from "../src/landing/HeroBeam";
import { HeroAuroraFallback } from "../src/landing/HeroAuroraFallback";
import { Hero } from "../src/landing/Hero";

Object.assign(globalThis, { React });
const beamSourceUrl = new URL("../src/landing/HeroBeam.tsx", import.meta.url);
const canvasSourceUrl = new URL("../src/landing/HeroBeamCanvas.tsx", import.meta.url);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
type Element = React.ReactElement<Record<string, any>>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

type Listener = (...args: any[]) => void;
type Hook = { value: any; dependencies?: unknown[]; cleanup?: () => void };

/** Run the actual component's client effects without loading WebGL or starting a server. */
async function beamHarness({ reduced = false, hidden = false, rejectImport = false, holdImport = false } = {}) {
  const source = await readFile(beamSourceUrl, "utf8");
  // Control only the import boundary; run the component's actual hooks and callbacks.
  const controlledSource = source.replace(/import\(["']\.\/HeroBeamCanvas["']\)/g, "__loadCanvas()");
  const compiled = ts.transpileModule(controlledSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true,
    },
  }).outputText;
  const hooks: Hook[] = [];
  const effects: Array<() => void> = [];
  const mediaListeners = new Set<Listener>();
  const visibilityListeners = new Set<Listener>();
  const observers: Array<{ callback: Listener; disconnected: boolean; targets: unknown[] }> = [];
  let slot = 0, imports = 0, writes = 0;
  const media = {
    matches: reduced,
    addEventListener(_event: string, listener: Listener) { mediaListeners.add(listener); },
    removeEventListener(_event: string, listener: Listener) { mediaListeners.delete(listener); },
    addListener(listener: Listener) { mediaListeners.add(listener); },
    removeListener(listener: Listener) { mediaListeners.delete(listener); },
  };
  const document = {
    hidden, visibilityState: hidden ? "hidden" : "visible",
    addEventListener(_event: string, listener: Listener) { visibilityListeners.add(listener); },
    removeEventListener(_event: string, listener: Listener) { visibilityListeners.delete(listener); },
  };
  class IntersectionObserver {
    private record: typeof observers[number];
    constructor(callback: Listener) {
      this.record = { callback, disconnected: false, targets: [] };
      observers.push(this.record);
    }
    observe(target: unknown) { this.record.targets.push(target); }
    unobserve(target: unknown) { this.record.targets = this.record.targets.filter((item) => item !== target); }
    disconnect() { this.record.disconnected = true; }
  }
  const memo = (factory: () => any, dependencies: unknown[]) => {
    const index = slot++, old = hooks[index];
    if (!old || dependencies.length !== old.dependencies?.length || dependencies.some((item, i) => !Object.is(item, old.dependencies?.[i]))) {
      hooks[index] = { value: factory(), dependencies: [...dependencies] };
    }
    return hooks[index].value;
  };
  const Canvas = () => null;
  const canvasModule = { default: Canvas, HeroBeamCanvas: Canvas };
  let finishImport!: (value: typeof canvasModule) => void;
  const pendingImport = new Promise<typeof canvasModule>((resolve) => { finishImport = resolve; });
  const module = { exports: {} as { HeroBeam: () => React.ReactNode } };
  const react = {
    ...React,
    useState(initial: any) {
      const index = slot++;
      hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (value: any) => {
        hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value;
        writes += 1;
      }];
    },
    useRef(initial: any) {
      const index = slot++;
      return (hooks[index] ??= { value: { current: initial } }).value;
    },
    useId: () => "test-hero-beam",
    useMemo: memo,
    useCallback: (callback: () => any, dependencies: unknown[]) => memo(() => callback, dependencies),
    useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
      const index = slot++, old = hooks[index];
      if (!old || dependencies.length !== old.dependencies?.length || dependencies.some((item, i) => !Object.is(item, old.dependencies?.[i]))) {
        const record: Hook = { value: undefined, dependencies: [...dependencies], cleanup: old?.cleanup };
        hooks[index] = record;
        effects.push(() => { record.cleanup?.(); record.cleanup = callback() || undefined; });
      }
    },
  };
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    window: { matchMedia: () => media, IntersectionObserver },
    document, IntersectionObserver, console,
    __loadCanvas() {
      imports += 1;
      if (rejectImport) return Promise.reject(new Error("Simulated renderer import failure"));
      return holdImport ? pendingImport : Promise.resolve(canvasModule);
    },
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier.endsWith(".css")) return { default: new Proxy({}, { get: (_target, name) => String(name) }), __esModule: true };
      throw new Error(`Unexpected eager import: ${specifier}`);
    },
  });
  return {
    Canvas, observers, mediaListeners, visibilityListeners,
    get imports() { return imports; },
    get writes() { return writes; },
    finishImport() { finishImport(canvasModule); },
    render() {
      slot = 0;
      const tree = module.exports.HeroBeam();
      for (const element of elements(tree)) {
        const ref = element.props.ref;
        if (ref && typeof ref === "object" && !ref.current) ref.current = { id: "hero-beam-element" };
      }
      return tree;
    },
    commit() { effects.splice(0).forEach((effect) => effect()); },
    intersect(visible: boolean) {
      for (const observer of observers.filter((item) => !item.disconnected)) {
        observer.callback(observer.targets.map((target) => ({ target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 })));
      }
    },
    setReduced(value: boolean) {
      media.matches = value;
      for (const listener of mediaListeners) listener({ matches: value });
    },
    setHidden(value: boolean) {
      document.hidden = value;
      document.visibilityState = value ? "hidden" : "visible";
      for (const listener of visibilityListeners) listener();
    },
    dispose() { hooks.forEach((hook) => hook.cleanup?.()); },
  };
}

test("beam has deterministic decorative SSR output without loading WebGL", () => {
  const first = renderToStaticMarkup(React.createElement(HeroBeam));
  assert.equal(first, renderToStaticMarkup(React.createElement(HeroBeam)));
  assert.match(first, /aria-hidden="true"/);
  assert.match(first, /<svg/);
  assert.match(first, /focusable="false"/);
  assert.doesNotMatch(first, /<canvas|Loading|Math\.random|#8367c7|#ddd4ff/);
});

test("the hidden aurora is absent from SSR while the beam keeps unique SVG IDs", () => {
  const output = renderToStaticMarkup(React.createElement("div", null, React.createElement(HeroBeam), React.createElement(HeroBeam)));
  assert.equal((output.match(/<svg/g) ?? []).length, 2, "each hero renders only its original beam fallback");
  const ids = [...output.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "separate hero instances cannot share gradient or filter identifiers");
  for (const reference of output.matchAll(/url\(#([^)]+)\)/g)) {
    assert.ok(ids.includes(reference[1]), `Missing local SVG definition: ${reference[1]}`);
  }
  assert.doesNotMatch(output, /<canvas|tabindex=|role="button"|Loading|aurora/i);
});

test("hero keeps its copy and primary actions without the product links bar", () => {
  const output = renderToStaticMarkup(React.createElement(Hero, {
    signupUrl: "/signup", githubUrl: "https://github.com/outray-tunnel/outray",
  }));
  assert.match(output, /aria-labelledby="hero-title"/);
  assert.match(output, /min-h-\[min\(1060px,100svh\)\]/);
  assert.match(output, /var\(--container-page\)/);
  assert.match(output, /relative z-\[2\][^"\n]*text-center/);
  assert.match(output, /Everything between.*localhost.*production/);
  assert.match(output, /Connect your services, understand your systems, and keep your apps secure and reliable/);
  assert.match(output, /href="\/signup"/);
  assert.match(output, /href="https:\/\/github\.com\/outray-tunnel\/outray"/);
  assert.match(output, /Start free/);
  assert.match(output, /GitHub/);
  assert.equal((output.match(/<a /g) ?? []).length, 2, "only signup and GitHub actions remain in the hero");
  assert.doesNotMatch(output, /Explore OutRay products|href="\/products\//);
});

test("heavy WebGL code is isolated behind a client-only dynamic import", async () => {
  const source = await readFile(beamSourceUrl, "utf8");
  const file = ts.createSourceFile("HeroBeam.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = file.statements.filter(ts.isImportDeclaration).filter((item) => !item.importClause?.isTypeOnly).map((item) => (item.moduleSpecifier as ts.StringLiteral).text);
  assert.doesNotMatch(imports.join("\n"), /three|fiber|drei|HeroBeamCanvas|beam-group/);
  assert.match(source, /import\(["']\.\/HeroBeamCanvas["']\)/);
  const canvas = await readFile(canvasSourceUrl, "utf8");
  assert.match(canvas, /from ["']@react-three\/fiber["']/);
  assert.match(canvas, /from ["']\.\.\/components\/landing\/beam-group["']/);
  assert.match(canvas, /createRoot/);
  assert.match(canvas, /<BeamGroup\s*\//);
  assert.match(canvas, /position:\s*\[0,\s*0,\s*15\]/);
  assert.match(canvas, /fov:\s*45/);
});

test("hidden aurora components stay outside the beam's SSR and renderer imports", async () => {
  const beam = await readFile(beamSourceUrl, "utf8");
  const canvas = await readFile(canvasSourceUrl, "utf8");
  const aurora = await readFile(new URL("../src/landing/HeroAurora.tsx", import.meta.url), "utf8");
  const fallback = await readFile(new URL("../src/landing/HeroAuroraFallback.tsx", import.meta.url), "utf8");
  assert.equal((canvas.match(/\bcreateRoot\(canvas\)/g) ?? []).length, 1);
  assert.doesNotMatch(beam, /HeroAurora(?:Fallback)?/);
  assert.doesNotMatch(canvas, /HeroAurora/);
  assert.doesNotMatch(aurora, /\bcreateRoot\b|<Canvas\b|document\.createElement\(["']canvas/);
  assert.doesNotMatch(aurora, /PMREMGenerator|RoomEnvironment|MeshPhysicalMaterial|RoundedBoxGeometry|(?:ambient|point|directional)Light/);
  assert.doesNotMatch(fallback, /@react-three|from ["']three["']|\buseEffect\b|Math\.random/);
});

test("the aurora is clipped to the far right and cannot intercept hero interactions", async () => {
  const beam = await readFile(beamSourceUrl, "utf8");
  const canvas = await readFile(canvasSourceUrl, "utf8");
  const fallback = await readFile(new URL("../src/landing/HeroAuroraFallback.tsx", import.meta.url), "utf8");
  assert.match(fallback, /className="[^"]*absolute[^"]*top-0[^"]*right-\[-30%\]/, "the static aurora keeps its source beyond the screen edge");
  assert.match(fallback, /max-\[767px\]:hidden/);
  assert.match(beam, /className="[^"]*pointer-events-none[^"]*overflow-hidden/);
  assert.doesNotMatch(canvas, /className="[^"]*translate-/, "the shared renderer stays full width so the aurora can reach the page edge");
});

test("reduced motion keeps the static beam and never starts the animation bundle", async () => {
  const beam = await beamHarness({ reduced: true });
  beam.render(); beam.commit(); beam.intersect(true);
  beam.render(); beam.commit(); await flush();
  const tree = beam.render(); beam.commit();
  assert.equal(beam.imports, 0);
  assert.equal(elements(tree).some((element) => element.type === beam.Canvas), false);
  assert.match(renderToStaticMarkup(tree), /<svg/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /aurora/i);
  beam.dispose();
});

test("offscreen and hidden heroes do not load WebGL, and pause it after loading", async () => {
  const beam = await beamHarness({ hidden: true });
  beam.render(); beam.commit();
  beam.render(); beam.commit(); await flush();
  assert.equal(beam.imports, 0);
  beam.intersect(true); beam.render(); beam.commit(); await flush();
  assert.equal(beam.imports, 0, "a background tab does not initialize the GPU");
  beam.setHidden(false); beam.render(); beam.commit(); await flush();
  let tree = beam.render(); beam.commit();
  assert.equal(beam.imports, 1);
  let scene = elements(tree).find((element) => element.type === beam.Canvas);
  assert.ok(scene, "the scene is mounted only after its dynamic import resolves");
  assert.equal(scene.props.active, true);
  beam.intersect(false); tree = beam.render(); beam.commit();
  scene = elements(tree).find((element) => element.type === beam.Canvas);
  assert.ok(scene, "leaving the viewport pauses rather than reallocating the scene");
  assert.equal(scene.props.active, false);
  beam.intersect(true); beam.setHidden(true); tree = beam.render(); beam.commit();
  assert.equal(elements(tree).find((element) => element.type === beam.Canvas)?.props.active, false);
  assert.equal(beam.imports, 1, "visibility changes reuse the same renderer island");
  beam.dispose();
});

test("renderer failure retains the SSR beam instead of leaving a black or empty hero", async () => {
  const beam = await beamHarness();
  beam.render(); beam.commit(); beam.intersect(true);
  beam.render(); beam.commit(); await flush();
  const initial = beam.render(); beam.commit();
  const scene = elements(initial).find((element) => element.type === beam.Canvas);
  assert.ok(scene);
  assert.equal(typeof scene.props.onReady, "function");
  assert.equal(typeof scene.props.onError, "function");
  assert.match(renderToStaticMarkup(initial), /<svg/);
  scene.props.onReady();
  beam.render(); beam.commit();
  scene.props.onError();
  const failed = beam.render(); beam.commit();
  assert.match(renderToStaticMarkup(failed), /<svg/);
  assert.doesNotMatch(renderToStaticMarkup(failed), /aurora/i);
  assert.equal(elements(failed).some((element) => element.type === beam.Canvas), false);
  beam.dispose();
});

test("a failed animation import leaves the decorative fallback usable", async () => {
  const beam = await beamHarness({ rejectImport: true });
  beam.render(); beam.commit(); beam.intersect(true);
  beam.render(); beam.commit(); await flush();
  const tree = beam.render(); beam.commit();
  assert.equal(beam.imports, 1);
  assert.match(renderToStaticMarkup(tree), /<svg/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /aurora/i);
  assert.equal(elements(tree).some((element) => element.type === beam.Canvas), false);
  beam.dispose();
});

test("media preference changes unmount the scene and all browser observers clean up", async () => {
  const beam = await beamHarness();
  beam.render(); beam.commit(); beam.intersect(true);
  beam.render(); beam.commit(); await flush();
  assert.ok(elements(beam.render()).some((element) => element.type === beam.Canvas));
  beam.commit();
  beam.setReduced(true);
  const tree = beam.render(); beam.commit();
  assert.equal(elements(tree).some((element) => element.type === beam.Canvas), false);
  assert.match(renderToStaticMarkup(tree), /<svg/);
  beam.dispose();
  assert.equal(beam.mediaListeners.size, 0);
  assert.equal(beam.visibilityListeners.size, 0);
  assert.ok(beam.observers.every((observer) => observer.disconnected));
});

test("an import finishing after unmount cannot update the disconnected component", async () => {
  const beam = await beamHarness({ holdImport: true });
  beam.render(); beam.commit(); beam.intersect(true);
  beam.render(); beam.commit();
  assert.equal(beam.imports, 1);
  beam.dispose();
  const writes = beam.writes;
  beam.finishImport(); await flush();
  assert.equal(beam.writes, writes);
});

/** Exercise the island against a bounded R3F root, not a real graphics context. */
async function canvasHarness({ rejectConfiguration = false, throwConfiguration = false, throwRootCreation = false, holdConfiguration = false, resizeObserver = true, width = 640 } = {}) {
  const source = await readFile(canvasSourceUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const hooks: Hook[] = [];
  const effects: Array<() => void> = [];
  const frames: Array<() => void> = [];
  const configured: Record<string, any>[] = [];
  const rendered: React.ReactNode[] = [];
  const scenes: React.ReactNode[] = [];
  const frameloops: string[] = [];
  const sizes: Array<[number, number]> = [];
  const resizeListeners = new Set<Listener>();
  const observers: Array<{ callback: Listener; disconnected: boolean; targets: unknown[] }> = [];
  const canvases: Array<{ listeners: Map<string, Listener>; removed: boolean; addEventListener: Listener; removeEventListener: Listener; remove: Listener }> = [];
  const element = { clientWidth: width, clientHeight: 380, children: [] as unknown[], appendChild(canvas: unknown) { this.children.push(canvas); } };
  const BeamGroup = () => null;
  const HeroAurora = () => null;
  let slot = 0, ready = 0, failures = 0, unmounts = 0;
  let finishConfiguration!: () => void;
  const pendingConfiguration = new Promise<void>((resolve) => { finishConfiguration = resolve; });
  const state = {
    setFrameloop(value: string) { frameloops.push(value); },
    setSize(width: number, height: number) { sizes.push([width, height]); },
  };
  const store = { getState: () => state };
  const onReady = () => ready++;
  const onError = () => failures++;
  const root = {
    configure(options: Record<string, any>) {
      configured.push(options);
      if (throwConfiguration) throw new Error("Synchronous renderer configuration failure");
      if (rejectConfiguration) return Promise.reject(new Error("WebGL initialization failed"));
      return holdConfiguration ? pendingConfiguration : Promise.resolve();
    },
    render(tree: React.ReactNode) {
      rendered.push(tree);
      const child = (tree as Element).props.children as Element;
      // R3F calls the scene component. Keep its ref in a separate hook slot.
      scenes.push((child.type as (props: any) => React.ReactNode)(child.props));
      return store;
    },
    unmount() { unmounts++; },
  };
  class ResizeObserver {
    private record: typeof observers[number];
    constructor(callback: Listener) {
      this.record = { callback, disconnected: false, targets: [] };
      observers.push(this.record);
    }
    observe(target: unknown) { this.record.targets.push(target); }
    disconnect() { this.record.disconnected = true; }
  }
  const react = {
    ...React,
    useRef(initial: any) { const index = slot++; return (hooks[index] ??= { value: { current: initial } }).value; },
    useEffect(callback: () => void | (() => void), dependencies: unknown[]) {
      const index = slot++, old = hooks[index];
      if (!old || dependencies.length !== old.dependencies?.length || dependencies.some((item, i) => !Object.is(item, old.dependencies?.[i]))) {
        const record: Hook = { value: undefined, dependencies: [...dependencies], cleanup: old?.cleanup };
        hooks[index] = record;
        effects.push(() => { record.cleanup?.(); record.cleanup = callback() || undefined; });
      }
    },
  };
  const module = { exports: {} as { default: (props: { active: boolean; onReady: Listener; onError: Listener }) => React.ReactNode } };
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    ...(resizeObserver ? { ResizeObserver } : {}),
    document: {
      createElement(tag: string) {
        assert.equal(tag, "canvas");
        const listeners = new Map<string, Listener>();
        const canvas = {
          listeners, removed: false,
          addEventListener(event: string, listener: Listener) { listeners.set(event, listener); },
          removeEventListener(event: string, listener: Listener) { if (listeners.get(event) === listener) listeners.delete(event); },
          remove() { canvas.removed = true; element.children = element.children.filter((child) => child !== canvas); },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
    window: {
      addEventListener(event: string, listener: Listener) { assert.equal(event, "resize"); resizeListeners.add(listener); },
      removeEventListener(event: string, listener: Listener) { assert.equal(event, "resize"); resizeListeners.delete(listener); },
    },
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@react-three/fiber") return {
        extend() {},
        createRoot(canvas: unknown) {
          assert.ok(canvases.includes(canvas as any));
          if (throwRootCreation) throw new Error("Synchronous root creation failure");
          return root;
        },
        useFrame(callback: () => void) { frames.push(callback); },
        useThree(selector?: (state: unknown) => unknown) {
          const state = { viewport: { width: 12, height: 6 }, size: { width: element.clientWidth, height: element.clientHeight } };
          return selector ? selector(state) : state;
        },
      };
      if (specifier === "three") return new Proxy({}, { get: () => class ThreeObject {} });
      if (specifier === "../components/landing/beam-group") return { BeamGroup };
      if (specifier.endsWith(".css")) return { default: { canvasLayer: "canvasLayer" }, __esModule: true };
      throw new Error(`Unexpected canvas island import: ${specifier}`);
    },
  });
  return {
    configured, rendered, scenes, BeamGroup, HeroAurora, frameloops, sizes, observers, canvases, resizeListeners, element,
    get ready() { return ready; },
    get failures() { return failures; },
    get unmounts() { return unmounts; },
    render(active = true) {
      slot = 0;
      const tree = module.exports.default({ active, onReady, onError });
      const ref = (tree as Element).props.ref;
      ref.current = element;
      return tree;
    },
    commit() { effects.splice(0).forEach((effect) => effect()); },
    frame() { frames.forEach((callback) => callback()); },
    resize(width: number, height: number) {
      element.clientWidth = width; element.clientHeight = height;
      observers.filter((observer) => !observer.disconnected).forEach((observer) => observer.callback());
      resizeListeners.forEach((listener) => listener());
    },
    finishConfiguration,
    dispose() { hooks.forEach((hook) => hook.cleanup?.()); },
  };
}

test("renderer uses the main camera, pauses frames offscreen, and reports readiness only after a frame", async () => {
  const canvas = await canvasHarness();
  canvas.render(); canvas.commit(); await flush();
  assert.equal(canvas.configured.length, 1);
  const settings = canvas.configured[0];
  assert.deepEqual(JSON.parse(JSON.stringify(settings.camera)), { position: [0, 0, 15], fov: 45 });
  assert.equal(settings.gl.alpha, true, "the renderer cannot cover the fallback with an opaque black canvas");
  assert.equal(settings.gl.powerPreference, "low-power");
  assert.equal(settings.frameloop, "never");
  assert.equal(canvas.ready, 0, "configuration alone does not mean a scene has rendered");
  assert.equal(canvas.frameloops.at(-1), "always");
  canvas.frame(); canvas.frame();
  assert.equal(canvas.ready, 1);
  canvas.render(false); canvas.commit();
  assert.equal(canvas.frameloops.at(-1), "never");
  canvas.render(true); canvas.commit();
  assert.equal(canvas.frameloops.at(-1), "always");
  assert.equal(canvas.configured.length, 1, "pause and resume do not create extra GPU contexts");
  canvas.dispose();
});

test("the active scene hides aurora while preserving the original beam and desktop offset", async () => {
  for (const width of [640, 1280]) {
    const canvas = await canvasHarness({ width });
    canvas.render(); canvas.commit(); await flush();
    assert.equal(canvas.configured.length, 1);
    const scene = elements(canvas.scenes[0]);
    assert.equal(scene.filter((element) => element.type === canvas.HeroAurora).length, 0);
    assert.equal(scene.filter((element) => element.type === canvas.BeamGroup).length, 1);
    const beamGroup = scene.find((element) => element.type === "group" && elements(element.props.children).some((child) => child.type === canvas.BeamGroup));
    assert.ok(beamGroup);
    assert.ok(Math.abs(beamGroup.props.position[0] - (width >= 768 ? -1.2 : 0)) < 1e-10);
    assert.deepEqual(JSON.parse(JSON.stringify(beamGroup.props.position.slice(1))), [0, 0]);
    canvas.dispose();
  }
});

test("WebGL configure rejection is contained and the incomplete renderer is released", async () => {
  const canvas = await canvasHarness({ rejectConfiguration: true });
  canvas.render(); canvas.commit(); await flush();
  assert.equal(canvas.failures, 1);
  assert.equal(canvas.ready, 0);
  assert.equal(canvas.rendered.length, 0);
  canvas.dispose();
  assert.equal(canvas.unmounts, 1);
  assert.ok(canvas.canvases.every((element) => element.removed));
  assert.ok(canvas.observers.every((observer) => observer.disconnected));
});

test("synchronous root creation failure removes the unused canvas and reports fallback", async () => {
  const canvas = await canvasHarness({ throwRootCreation: true });
  canvas.render();
  assert.doesNotThrow(() => canvas.commit());
  await flush();
  assert.equal(canvas.failures, 1);
  assert.equal(canvas.ready, 0);
  assert.equal(canvas.configured.length, 0);
  assert.equal(canvas.element.children.length, 0);
  assert.ok(canvas.canvases.every((element) => element.removed));
  canvas.dispose();
});

test("synchronous renderer configuration failure is contained like an asynchronous rejection", async () => {
  const canvas = await canvasHarness({ throwConfiguration: true });
  canvas.render();
  assert.doesNotThrow(() => canvas.commit());
  await flush();
  assert.equal(canvas.failures, 1);
  assert.equal(canvas.ready, 0);
  assert.equal(canvas.rendered.length, 0);
  canvas.dispose();
  assert.equal(canvas.unmounts, 1);
  assert.equal(canvas.element.children.length, 0);
});

test("renderer resize and context-loss handlers are scoped to the mounted island", async () => {
  const canvas = await canvasHarness();
  canvas.render(); canvas.commit(); await flush();
  canvas.resize(320, 240);
  assert.deepEqual(canvas.sizes.at(-1), [320, 240]);
  let prevented = false;
  const lost = canvas.canvases[0].listeners.get("webglcontextlost");
  assert.ok(lost);
  lost({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(canvas.failures, 1);
  canvas.dispose();
  const changes = canvas.sizes.length;
  canvas.resize(900, 700);
  lost({ preventDefault() {} });
  assert.equal(canvas.sizes.length, changes);
  assert.equal(canvas.failures, 1, "a retired canvas cannot fail the current scene");
  assert.equal(canvas.canvases[0].listeners.size, 0);
});

test("a renderer configured after unmount cannot render or notify readiness", async () => {
  const canvas = await canvasHarness({ holdConfiguration: true });
  canvas.render(); canvas.commit(); canvas.dispose();
  canvas.finishConfiguration(); await flush();
  assert.equal(canvas.rendered.length, 0);
  assert.equal(canvas.ready, 0);
  assert.equal(canvas.unmounts, 1);
  assert.equal(canvas.element.children.length, 0);
});

test("older browsers use a removable window resize listener instead of ResizeObserver", async () => {
  const canvas = await canvasHarness({ resizeObserver: false });
  canvas.render(); canvas.commit(); await flush();
  assert.equal(canvas.resizeListeners.size, 1);
  canvas.resize(480, 320);
  assert.deepEqual(canvas.sizes.at(-1), [480, 320]);
  canvas.dispose();
  assert.equal(canvas.resizeListeners.size, 0);
});

/** Exercise actual aurora composition without rendering shaders or allocating a GPU context. */
async function auroraHarness() {
  const source = await readFile(new URL("../src/landing/HeroAurora.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  let width = 1280;
  const react = {
    ...React,
    useRef(initial: any) { return { current: initial }; },
    useMemo(factory: () => any) { return factory(); },
  };
  const module = { exports: {} as { HeroAurora: () => React.ReactNode } };
  runInNewContext(compiled, {
    React: react, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return react;
      if (specifier === "@react-three/fiber") return {
        extend() {}, useFrame() {},
        useThree(selector: (state: any) => unknown) { return selector({ viewport: { width: 12, height: 6 }, size: { width } }); },
      };
      if (specifier === "three") return new Proxy({}, { get: () => class ThreeObject {} });
      throw new Error(`Unexpected aurora module dependency: ${specifier}`);
    },
  });
  return {
    root(nextWidth = 1280) { width = nextWidth; return module.exports.HeroAurora() as Element | null; },
    curtain(element: Element) { return (element.type as (props: any) => React.ReactNode)(element.props); },
  };
}

test("the larger aurora has an offscreen source and leaves mobile headlines clear", async () => {
  const aurora = await auroraHarness();
  assert.equal(aurora.root(767), null);
  const scene = aurora.root(1280);
  assert.ok(scene);
  assert.ok(scene.props.position[0] > 6, "the source is beyond the viewport's far-right edge");
  assert.ok(scene.props.scale > 1, "the aurora is enlarged rather than its earlier reduced-size sculpture");
  const curtains = elements(scene).filter((element) => typeof element.props.phase === "number");
  assert.equal(curtains.length, 3, "the aurora keeps its three layered curtains");
  for (const curtain of curtains) {
    const mesh = elements(aurora.curtain(curtain));
    assert.ok(mesh.some((element) => element.type === "planeGeometry"));
    assert.ok(mesh.some((element) => element.type === "shaderMaterial"));
    assert.equal(mesh.some((element) => /box|physical|light/i.test(String(element.type))), false, "only aurora geometry remains");
  }
});

test("the static aurora consists only of ribbons with no cube or metallic definitions", () => {
  const tree = elements(HeroAuroraFallback({ id: "ribbons-only" }));
  const paths = tree.filter((element) => element.type === "path");
  assert.equal(paths.length, 3);
  const [left, top, width, height] = String(tree[0].props.viewBox).split(/\s+/).map(Number);
  for (const path of paths) {
    const source = String(path.props.d).match(/^M(-?[\d.]+)\s+(-?[\d.]+)/);
    assert.ok(source);
    assert.ok(Number(source[1]) > left + width, "each static ribbon starts beyond the viewBox's right edge");
    assert.ok(Number(source[2]) > top && Number(source[2]) < top + height, "ribbons enter from the side rather than from above");
  }
  const html = renderToStaticMarkup(React.createElement(HeroAuroraFallback, { id: "ribbons-only" }));
  assert.doesNotMatch(html, /metal|cube|tungsten/i);
  assert.match(html, /focusable="false"/);
  assert.match(html, /aria-hidden="true"/);
});

test("the aurora points horizontally inward from its offscreen source", async () => {
  const aurora = await auroraHarness();
  const scene = aurora.root();
  assert.ok(scene);
  assert.deepEqual(JSON.parse(JSON.stringify(scene.props.rotation.slice(0, 2))), [0, 0]);
  assert.ok(Math.abs(scene.props.rotation[2] - Math.PI / 2) < 1e-10, "rotating the full scene maps its upward emission to left/inward");
  assert.equal(elements(scene).filter((element) => typeof element.props.phase === "number").length, 3);
});

test("the animated and static aurora keep their calibrated alignment with the original beam", async () => {
  const aurora = await auroraHarness();
  const scene = aurora.root();
  assert.ok(scene);
  assert.equal(scene.props.position[1], 1, "the rotated curtain offset is raised to align with the original beam");
  const fallback = await readFile(new URL("../src/landing/HeroAuroraFallback.tsx", import.meta.url), "utf8");
  assert.match(fallback, /className="[^"]*top-0/, "the static aurora cannot drift down during SSR or reduced motion");
});
