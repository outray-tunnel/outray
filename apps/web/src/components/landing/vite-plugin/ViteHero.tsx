import { useState } from "react";
import { ArrowRight, Copy, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SiVite } from "react-icons/si";
import { motion } from "motion/react";
import { Canvas } from "@react-three/fiber";
import { ViteBeamGroup } from "./ViteBeamGroup";

export const ViteHero = () => {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText("npm install @outray/vite");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-[80vh] flex flex-col justify-center items-center pt-32 pb-16 overflow-hidden">
      {/* Beam background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
          <color attach="background" args={["#000000"]} />
          <ViteBeamGroup />
        </Canvas>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-4xl mx-auto px-6 text-center"
      >
        {/* Vite Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm">
            <SiVite className="w-12 h-12 text-[#646CFF]" />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Expose your Vite app
          <br />
          <span className="text-white/60">
            with zero config
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl md:text-2xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          The official OutRay plugin for Vite. Automatically creates a public tunnel 
          when your dev server starts. No CLI required.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Link
            to="/signup"
            className="w-full sm:w-auto px-8 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={20} />
          </Link>
          <Link
            to="/docs/$"
            params={{ _splat: "vite-plugin" }}
            className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-full font-medium text-lg transition-all border border-white/10 backdrop-blur-sm"
          >
            Documentation
          </Link>
        </div>

        {/* Install command */}
        <button
          onClick={copyCommand}
          className="inline-flex items-center gap-3 text-white/60 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 font-mono text-sm transition-all group cursor-pointer backdrop-blur-sm"
        >
          <span className="text-accent">$</span> npm install @outray/vite
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

      {/* Testimonial card - commented out for now */}
      {/* <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative z-10 mt-16 max-w-2xl mx-auto px-6"
      >
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
          <p className="text-white/70 text-lg leading-relaxed mb-4">
            "Awesome to see OutRay focus on the Vite ecosystem to provide 
            the best tunnel experience for frontend developers."
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 font-bold text-sm">
              EY
            </div>
            <div>
              <p className="text-white font-medium">Evan You</p>
              <p className="text-white/40 text-sm">Creator of Vite & Vue.js</p>
            </div>
          </div>
        </div>
      </motion.div> */}
    </div>
  );
};
