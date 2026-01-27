import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

export const NextCTA = () => {
  return (
    <div className="py-32 border-t border-white/5">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto px-6 text-center"
      >
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="OutRay" className="w-16 h-16" />
        </div>

        <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
          Start tunneling today
        </h2>
        <p className="text-lg text-white/40 max-w-xl mx-auto mb-10">
          Get a public URL for your local Next.js dev server in seconds.
        </p>

        <Link
          to="/signup"
          className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg transition-all hover:scale-105"
        >
          Sign up for free <ArrowRight size={20} />
        </Link>
      </motion.div>
    </div>
  );
};
