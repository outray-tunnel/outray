import { motion } from "motion/react";

export const ExpressCodeExample = () => {
  return (
    <div className="py-24 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left side - Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              One import.
              <br />
              <span className="text-white/50">One line of code.</span>
            </h2>
            <p className="text-lg text-white/40 leading-relaxed mb-8">
              Import the plugin, call it with your app, and you're done. 
              The tunnel starts automatically when your server listens, 
              even on dynamic ports. No configuration required.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="/signup"
                className="px-6 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition-colors"
              >
                Get Started
              </a>
              <a
                href="/docs/express-plugin"
                className="px-6 py-3 bg-transparent text-white/50 hover:text-white transition-colors"
              >
                Documentation →
              </a>
            </div>
          </motion.div>

          {/* Right side - Code example */}
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
              <span className="text-xs text-white/40 ml-2">index.js</span>
            </div>
            <div className="p-6 font-mono text-sm overflow-x-auto">
              <pre className="text-white/70">
                <code>
                  <span className="text-accent">import</span> express{" "}
                  <span className="text-accent">from</span>{" "}
                  <span className="text-green-400/80">'express'</span>;{"\n"}
                  <span className="text-accent">import</span> outray{" "}
                  <span className="text-accent">from</span>{" "}
                  <span className="text-green-400/80">'@outray/express'</span>;{"\n"}
                  {"\n"}
                  <span className="text-accent">const</span> app = express();{"\n"}
                  {"\n"}
                  <span className="text-white/40">{"// Add OutRay middleware"}</span>{"\n"}
                  outray(app);{"\n"}
                  {"\n"}
                  app.get(<span className="text-green-400/80">'/'</span>, (req, res) {"=>"} {"{"}
                  {"\n"}
                  {"  "}res.json({"{"} message: <span className="text-green-400/80">'Hello World!'</span> {"}"});{"\n"}
                  {"}"});{"\n"}
                  {"\n"}
                  app.listen(<span className="text-blue-400">3000</span>);
                </code>
              </pre>
            </div>

            {/* Terminal output preview */}
            <div className="border-t border-white/5 p-6 bg-black/30">
              <div className="font-mono text-sm space-y-1">
                <p className="text-white/30">$ node index.js</p>
                <p className="text-white/50 mt-3">
                  Server running on port 3000
                </p>
                <p className="text-white/50">
                  <span className="text-green-400">➜</span>{" "}
                  <span className="font-bold">Tunnel:</span>{"  "}
                  <span className="text-accent">https://quick-tiger.outray.app</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
