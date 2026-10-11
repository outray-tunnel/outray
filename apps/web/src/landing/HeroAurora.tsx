import { useMemo, useRef } from "react";
import { extend, useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, PlaneGeometry, ShaderMaterial } from "three";

extend({ PlaneGeometry });

const auroraVertex = `
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float rise = uv.y;
    float wave = sin(rise * 7.0 - uTime * 0.12 + uPhase);
    p.x *= 0.12 + pow(rise, 0.8) * 0.85;
    p.x -= pow(rise, 1.2) * 0.65;
    p.x += wave * rise * 0.75;
    p.z += sin(uv.x * 9.0 + rise * 5.0 + uPhase) * rise * 0.65;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const auroraFragment = `
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    float drift = sin(vUv.y * 6.0 - uTime * 0.13 + uPhase) * 3.0;
    float folds = pow(0.5 + 0.5 * sin(vUv.x * 32.0 + drift), 3.0);
    float threads = pow(0.5 + 0.5 * sin(vUv.x * 230.0 + drift * 2.0), 7.0);
    float edge = pow(max(sin(vUv.x * 3.14159265), 0.0), 1.4);
    float base = smoothstep(0.0, 0.06, vUv.y);
    float top = 1.0 - smoothstep(0.38, 1.0, vUv.y);
    vec3 green = vec3(0.23, 1.0, 0.62);
    vec3 cyan = vec3(0.15, 0.68, 0.91);
    vec3 violet = vec3(0.49, 0.26, 0.88);
    vec3 color = mix(green, cyan, smoothstep(0.12, 0.65, vUv.y));
    color = mix(color, violet, smoothstep(0.5, 0.94, vUv.y));
    float alpha = (0.045 + folds * 0.23 + threads * 0.075) * edge * base * top;
    gl_FragColor = vec4(color, alpha);
  }
`;

function AuroraCurtain({ phase, depth }: { phase: number; depth: number }) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPhase: { value: phase } }), [phase]);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[-0.65 + phase * 0.1, 5.3, depth]} renderOrder={1}>
      <planeGeometry args={[7, 8, 48, 64]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={auroraVertex} fragmentShader={auroraFragment}
        transparent depthWrite={false} side={DoubleSide} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

export function HeroAurora() {
  const viewport = useThree((state) => state.viewport);
  const width = useThree((state) => state.size.width);
  // Keep the origin outside the hero: only the broad, inward-flowing curtains show.
  if (width < 768) return null;
  return (
    <group position={[viewport.width / 2 + 4.2, 1, 0]} scale={1.7} rotation={[0, 0, Math.PI / 2]}>
      <AuroraCurtain phase={0} depth={-1.5} />
      <AuroraCurtain phase={1.8} depth={-1.2} />
      <AuroraCurtain phase={3.7} depth={-0.9} />
    </group>
  );
}
