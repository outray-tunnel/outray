import { useState, useRef } from "react";
import { ArrowRight, Copy, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SiNestjs } from "react-icons/si";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { Canvas } from "@react-three/fiber";
import { NestJSBeamGroup } from "./NestJSBeamGroup";

export const NestJSHero = () => {
  const [copied, setCopied] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  
  // Mouse tracking for 3D effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Smooth spring animations
  const springConfig = { damping: 20, stiffness: 300 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [15, -15]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-15, 15]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!logoRef.current) return;
    const rect = logoRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = (e.clientX - centerX) / rect.width;
    const y = (e.clientY - centerY) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const copyCommand = () => {
    navigator.clipboard.writeText("npm install @outray/nestjs");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-[80vh] flex flex-col justify-center items-center pt-32 pb-16 overflow-hidden">
      {/* Beam background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <color attach="background" args={["#000000"]} />
          <NestJSBeamGroup />
        </Canvas>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-4xl mx-auto px-6 text-center"
      >
        <div 
          className="flex justify-center mb-8"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div ref={logoRef} className="relative" style={{ perspective: "1000px" }}>
            <div className="absolute inset-0 w-24 h-24 pointer-events-none" style={{ left: "0px", top: "0px" }}>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-[#E0234E]/60"
                  style={{
                    left: "50%",
                    top: "50%",
                  }}
                  animate={{
                    x: [
                      Math.cos((i * Math.PI * 2) / 8) * 60,
                      Math.cos((i * Math.PI * 2) / 8 + Math.PI * 2) * 60,
                    ],
                    y: [
                      Math.sin((i * Math.PI * 2) / 8) * 60,
                      Math.sin((i * Math.PI * 2) / 8 + Math.PI * 2) * 60,
                    ],
                  }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * 0.3,
                  }}
                />
              ))}
            </div>

            <motion.div
              className="relative w-24 h-24 rounded-2xl flex items-center justify-center cursor-pointer"
              style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
              }}
            >
              <div 
                className="absolute inset-0 rounded-2xl bg-[#1a0a10]"
                style={{ transform: "translateZ(-20px)" }}
              />
              
              <div 
                className="absolute inset-0 rounded-2xl bg-[#2a1018]"
                style={{ transform: "translateZ(-10px)" }}
              />
              
              <div 
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#E0234E] to-[#E0234E]/80 border border-white/10"
                style={{ transform: "translateZ(0px)" }}
              />
              
              <div
                className="relative z-10"
                style={{ transform: "translateZ(30px)" }}
              >
                <SiNestjs className="w-14 h-14 text-white" />
              </div>
            </motion.div>
          </div>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          OutRay for{" "}
          <span className="text-[#E0234E]">NestJS</span>
        </h1>

        <p className="text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          Expose your local NestJS application to the internet with a single function call.
          Perfect for webhook testing, API sharing, and mobile development.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Link
            to="/signup"
            className="w-full sm:w-auto px-8 py-4 bg-[#E0234E] text-white hover:bg-[#E0234E]/90 rounded-full font-bold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={20} />
          </Link>
          <Link
            to="/docs/$"
            params={{ _splat: "nestjs-plugin" }}
            className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-full font-medium text-lg transition-all border border-white/10 backdrop-blur-sm"
          >
            Documentation
          </Link>
        </div>

        <button
          onClick={copyCommand}
          className="inline-flex items-center gap-3 text-white/60 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 font-mono text-sm transition-all group cursor-pointer backdrop-blur-sm"
        >
          <span className="text-[#E0234E]">$</span> npm install @outray/nestjs
          {copied ? (
            <Check size={16} className="text-green-400" />
          ) : (
            <Copy
              size={16}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          )}
        </button>
      </motion.div>
    </div>
  );
};
