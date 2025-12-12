import { createFileRoute } from "@tanstack/react-router";
import "../App.css";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemo, useRef, useState, useEffect } from "react";
import { MousePointer2, Github } from "lucide-react";
import { Terminal } from "../components/Terminal";
import { WaitlistForm } from "../components/WaitlistForm";

export const Route = createFileRoute("/")({
  component: Home,
});

function BeamGroup({ interactive }: { interactive: boolean }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (group.current) {
      const maxRotation = Math.PI / 8;
      const targetRotation = interactive ? state.mouse.y * maxRotation : 0;

      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        targetRotation,
        0.1,
      );
    }
  });

  return (
    <group ref={group} position={[-10, 0, 0]}>
      <Spotlight />
      <Dust />
    </group>
  );
}

function Spotlight() {
  const mesh = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#ffffff") },
    }),
    [],
  );

  useFrame((state) => {
    if (mesh.current) {
      // @ts-expect-error - uTime is not in the type definition
      mesh.current.material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={mesh} position={[8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[1.2, 5, 16, 64, 1, true]} />
      <shaderMaterial
        side={THREE.DoubleSide}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vPos;
          void main() {
            vUv = uv;
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          varying vec2 vUv;
          varying vec3 vPos;


          float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }

          void main() {

            float beamLongitudinal = smoothstep(0.0, 0.6, vUv.y);
            

            float sourceSoftness = smoothstep(1.0, 0.85, vUv.y);

            float noise = random(vec2(vUv.x * 20.0, 0.0)); 
            float ray = smoothstep(0.4, 0.6, noise) * 0.04;
            
            float alpha = beamLongitudinal * sourceSoftness * 0.06;
            alpha += ray * beamLongitudinal * sourceSoftness;
            
            float core = smoothstep(0.5, 0.85, vUv.y) * smoothstep(1.0, 0.85, vUv.y) * 0.15;
            alpha += core;

            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </mesh>
  );
}

const generateParticles = (count: number) => {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * 4;
    const theta = Math.random() * Math.PI * 2;
    const x = (Math.random() - 0.5) * 16;
    pos[i * 3] = x;
    pos[i * 3 + 1] = r * Math.cos(theta);
    pos[i * 3 + 2] = r * Math.sin(theta);
  }
  return pos;
};

function Dust() {
  const count = 300;
  const mesh = useRef<THREE.Points>(null);

  const positions = useMemo(() => generateParticles(count), []);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = state.clock.elapsedTime * 0.05;
      mesh.current.position.x =
        8 + Math.sin(state.clock.elapsedTime * 0.2) * 0.5;
    }
  });

  return (
    <points ref={mesh} position={[8, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#ffffff"
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Home() {
  const [interactive, setInteractive] = useState(() => {
    // Check if window is defined for SSR safety
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("interactive-mode");
      return saved !== null ? JSON.parse(saved) : false;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("interactive-mode", JSON.stringify(interactive));
  }, [interactive]);

  return (
    <div className="relative flex items-center min-h-screen bg-black text-white overflow-hidden">
      <div
        className="absolute inset-0 z-0"
        style={{ transform: "translateX(-10%)" }}
      >
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <color attach="background" args={["#000000"]} />
          <BeamGroup interactive={interactive} />
        </Canvas>
      </div>

      <div className="absolute top-0 left-0 right-0 z-20 w-full max-w-7xl mx-auto px-6 lg:px-12 py-6 lg:py-8 flex justify-between items-center pointer-events-none">
        <div className="text-2xl font-semibold tracking-tighter pointer-events-auto">
          OutRay
        </div>
        <a
          href="https://github.com/akinloluwami/outray"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors pointer-events-auto backdrop-blur-sm border border-white/10"
        >
          <Github size={18} />
          <span className="text-sm font-medium">Star on GitHub</span>
        </a>
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between w-full max-w-7xl mx-auto px-6 lg:px-12 pointer-events-none gap-12 lg:gap-0 pt-20 lg:pt-0">
        <div className="flex flex-col items-center lg:items-start gap-8 lg:gap-10 w-full lg:w-auto">
          <h1 className="text-7xl md:text-7xl lg:text-9xl font-bold opacity-80 tracking-tight text-center lg:text-left">
            Like ngrok, <br /> but cooler.
          </h1>
          <WaitlistForm />
        </div>

        <div className="w-full flex justify-center lg:block lg:w-auto">
          <Terminal />
        </div>
      </div>

      <button
        onClick={() => setInteractive(!interactive)}
        className={`fixed bottom-8 right-8 p-4 rounded-full transition-all duration-300 pointer-events-auto z-50 ${
          interactive
            ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        <MousePointer2 size={24} />
      </button>
    </div>
  );
}
