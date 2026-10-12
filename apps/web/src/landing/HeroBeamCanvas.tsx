import { Component, useEffect, useRef, type ReactNode } from "react";
import { createRoot, extend, useFrame, useThree, type RootStore } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, Points, PointsMaterial, ShaderMaterial } from "three";
import { BeamGroup } from "../components/landing/beam-group";

// The same scene/shader as main, without registering unrelated Three objects.
extend({ BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, Points, PointsMaterial, ShaderMaterial });

export type HeroBeamCanvasProps = {
  active: boolean;
  onReady: () => void;
  onError: () => void;
};

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function BeamScene({ onReady }: { onReady: () => void }) {
  const notified = useRef(false);
  const viewport = useThree((state) => state.viewport);
  const width = useThree((state) => state.size.width);
  useFrame(() => {
    if (!notified.current) {
      notified.current = true;
      onReady();
    }
  });
  return <group position={[width >= 768 ? -viewport.width * 0.1 : 0, 0, 0]}><BeamGroup /></group>;
}

export default function HeroBeamCanvas({ active, onReady, onError }: HeroBeamCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const store = useRef<RootStore | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    store.current?.getState().setFrameloop(active ? "always" : "never");
  }, [active]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    // A fresh canvas per effect also makes Strict Mode cleanup safe: an old
    // renderer can never dispose the new mount's context.
    const canvas = document.createElement("canvas");
    element.appendChild(canvas);
    let root: ReturnType<typeof createRoot>;
    try {
      root = createRoot(canvas);
    } catch {
      canvas.remove();
      onError();
      return;
    }
    let disposed = false;
    const size = () => ({ width: element.clientWidth, height: element.clientHeight, top: 0, left: 0 });
    const fail = () => { if (!disposed) onError(); };
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    canvas.addEventListener("webglcontextlost", contextLost);
    const resize = () => {
      if (disposed) return;
      const { width, height } = size();
      store.current?.getState().setSize(width, height);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    if (!observer) window.addEventListener("resize", resize);

    // Canvas's built-in asynchronous configure path does not catch renderer
    // initialization failures. Own that promise so WebGL failures stay local
    // to this decorative effect, and the SSR fallback remains visible.
    const initialize = async () => {
      await root.configure({
        camera: { position: [0, 0, 15], fov: 45 },
        gl: { alpha: true, antialias: true, powerPreference: "low-power" },
        dpr: [1, 1.5],
        size: size(),
        frameloop: "never",
      });
      if (disposed) return;
      store.current = root.render(<SceneBoundary onError={fail}><BeamScene onReady={onReady} /></SceneBoundary>);
      resize();
      store.current.getState().setFrameloop(activeRef.current ? "always" : "never");
    };
    void initialize().catch(fail);

    return () => {
      disposed = true;
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", contextLost);
      store.current = null;
      root.unmount();
      canvas.remove();
    };
  }, [onReady, onError]);

  return <div ref={container} className="absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-[ready=true]/beam:opacity-100 motion-reduce:transition-none [&>canvas]:block [&>canvas]:size-full" />;
}
