import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const generateParticles = (count: number) => {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = Math.random() * 3;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 10;
    pos[i * 3] = r * Math.cos(theta);
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = r * Math.sin(theta);
  }
  return pos;
};

function Dust() {
  const count = 150;
  const mesh = useRef<THREE.Points>(null);
  const positions = useMemo(() => generateParticles(count), []);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.elapsedTime * 0.03;
      mesh.current.position.y =
        4 + Math.sin(state.clock.elapsedTime * 0.15) * 0.2;
    }
  });

  return (
    <points ref={mesh} position={[0, 4, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#ffffff"
        transparent
        opacity={0.7}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
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
      const material = mesh.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={mesh} position={[0, 8, 0]} rotation={[0, 0, 0]}>
      <cylinderGeometry args={[0.8, 8, 18, 64, 1, true]} />
      <shaderMaterial
        side={THREE.DoubleSide}
        transparent
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
            float beamLongitudinal = smoothstep(0.0, 0.5, vUv.y);
            
            float sourceSoftness = smoothstep(1.0, 0.85, vUv.y);

            float noise = random(vec2(vUv.x * 20.0, 0.0)); 
            float ray = smoothstep(0.4, 0.6, noise) * 0.06;
            
            float alpha = beamLongitudinal * sourceSoftness * 0.12;
            alpha += ray * beamLongitudinal * sourceSoftness;
            
            float core = smoothstep(0.5, 0.88, vUv.y) * smoothstep(1.0, 0.88, vUv.y) * 0.25;
            alpha += core;

            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </mesh>
  );
}

export function ViteBeamGroup() {
  const group = useRef<THREE.Group>(null);

  return (
    <group ref={group} position={[0, 0, 0]}>
      <Spotlight />
      <Dust />
    </group>
  );
}
