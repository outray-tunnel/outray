import { SiVercel, SiPrisma, SiTailwindcss, SiTypescript, SiTrpc, SiDrizzle } from "react-icons/si";
import { motion } from "motion/react";

const technologies = [
  {
    name: "Vercel",
    icon: SiVercel,
    color: "#FFFFFF",
  },
  {
    name: "TypeScript",
    icon: SiTypescript,
    color: "#3178C6",
  },
  {
    name: "Tailwind",
    icon: SiTailwindcss,
    color: "#06B6D4",
  },
  {
    name: "Prisma",
    icon: SiPrisma,
    color: "#2D3748",
  },
  {
    name: "Drizzle",
    icon: SiDrizzle,
    color: "#C5F74F",
  },
  {
    name: "tRPC",
    icon: SiTrpc,
    color: "#2596BE",
  },
];

export const NextTechnologies = () => {
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
            Works with your stack
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            The OutRay Next.js plugin integrates seamlessly with the modern Next.js ecosystem.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
        >
          {technologies.map((tech, index) => (
            <motion.div
              key={tech.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all group text-center"
            >
              <tech.icon
                className="w-8 h-8 mx-auto mb-3 opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ color: tech.color }}
              />
              <h3 className="font-medium text-white/70 text-sm">{tech.name}</h3>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
