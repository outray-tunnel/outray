import { SiMongodb, SiPostgresql, SiRedis, SiGraphql, SiStripe, SiSwagger } from "react-icons/si";
import { motion } from "motion/react";

const technologies = [
  {
    name: "MongoDB",
    icon: SiMongodb,
    color: "#47A248",
  },
  {
    name: "PostgreSQL",
    icon: SiPostgresql,
    color: "#4169E1",
  },
  {
    name: "Redis",
    icon: SiRedis,
    color: "#DC382D",
  },
  {
    name: "GraphQL",
    icon: SiGraphql,
    color: "#E10098",
  },
  {
    name: "Stripe",
    icon: SiStripe,
    color: "#635BFF",
  },
  {
    name: "Swagger",
    icon: SiSwagger,
    color: "#85EA2D",
  },
];

export const NestJSUseCases = () => {
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
            Built for your stack
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            The OutRay NestJS plugin works seamlessly with your favorite databases, APIs, and NestJS modules.
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
