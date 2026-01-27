import { motion } from "motion/react";

export const NextCodeExample = () => {
  return (
    <div className="py-24 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              Integrate with any
              <br />
              <span className="text-white/50">Next.js application</span>
            </h2>
            <p className="text-lg text-white/40 leading-relaxed mb-8">
              Whether you're using the App Router or Pages Router, building a full-stack app
              or a static site, OutRay seamlessly integrates into your Next.js workflow.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="/signup"
                className="px-6 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition-colors"
              >
                Get Started
              </a>
              <a
                href="/docs/nextjs-plugin"
                className="px-6 py-3 bg-transparent text-white/50 hover:text-white transition-colors"
              >
                Documentation →
              </a>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-[#0a0a0a] rounded-2xl border border-white/10 overflow-hidden"
          >
            <div className="bg-white/5 border-b border-white/5 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
              </div>
              <span className="text-xs text-white/40 ml-2">next.config.ts</span>
            </div>
            <div className="p-6 font-mono text-sm overflow-x-auto">
              <pre className="text-white/70">
                <code>
                  <span className="text-accent">import</span> withOutray{" "}
                  <span className="text-accent">from</span>{" "}
                  <span className="text-green-400/80">'@outray/next'</span>;{"\n"}
                  {"\n"}
                  <span className="text-accent">export default</span> withOutray({"{"}
                  {"\n"}
                  {"  "}<span className="text-white/50">// your Next.js config</span>{"\n"}
                  {"}"});
                </code>
              </pre>
            </div>

            <div className="border-t border-white/5 p-6 bg-black/30">
              <div className="font-mono text-sm space-y-1">
                <p className="text-white/30">$ npm run dev</p>
                <p className="text-white/50 mt-3">
                  <span className="text-green-400">➜</span>{" "}
                  <span className="font-bold">Local:</span>{"   "}
                  <span className="text-accent">http://localhost:3000</span>
                </p>
                <p className="text-white/50">
                  <span className="text-green-400">➜</span>{" "}
                  <span className="font-bold">Tunnel:</span>{"  "}
                  <span className="text-accent">https://abc123.outray.dev</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
