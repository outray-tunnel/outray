import { SiReact, SiVuedotjs, SiSvelte, SiSolid, SiAstro, SiRemix } from "react-icons/si";
import { motion } from "motion/react";

const frameworks = [
  {
    name: "React",
    icon: SiReact,
    color: "#61DAFB",
  },
  {
    name: "Vue",
    icon: SiVuedotjs,
    color: "#4FC08D",
  },
  {
    name: "Svelte",
    icon: SiSvelte,
    color: "#FF3E00",
  },
  {
    name: "Solid",
    icon: SiSolid,
    color: "#2C4F7C",
  },
  {
    name: "Astro",
    icon: SiAstro,
    color: "#FF5D01",
  },
  {
    name: "Remix",
    icon: SiRemix,
    color: "#FFFFFF",
  },
];

export const ViteFrameworks = () => {
  return (
    <div className="py-24 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Works with your favorite framework
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            The OutRay Vite plugin seamlessly integrates with all Vite-based frameworks.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
        >
          {frameworks.map((framework, index) => (
            <motion.div
              key={framework.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all group text-center"
            >
              <framework.icon
                className="w-8 h-8 mx-auto mb-3 opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ color: framework.color }}
              />
              <h3 className="font-medium text-white/70 text-sm">{framework.name}</h3>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

