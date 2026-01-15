import { useEffect, useState } from "react";
import { SiGithub } from "react-icons/si";
import { Star } from "lucide-react";

interface GitHubButtonProps {
  size?: "sm" | "md";
}

export const GitHubButton = ({ size = "md" }: GitHubButtonProps) => {
  const [stars, setStars] = useState<number | null>(600);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const res = await fetch(
          "https://api.github.com/repos/outray-tunnel/outray",
        );
        if (res.ok) {
          const data = await res.json();
          setStars(data.stargazers_count);
        }
      } catch {
        // Silently fail
      }
    };
    fetchStars();
  }, []);

  const formatStars = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    }
    return count.toString();
  };

  const isSmall = size === "sm";

  return (
    <a
      href="https://github.com/akinloluwami/outray"
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/10 hover:scale-105 ${
        isSmall ? "px-3 py-1.5 text-sm" : "px-4 py-2"
      }`}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-orange-500/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
      <SiGithub
        className="relative z-10 text-white/80 transition-colors group-hover:text-white"
        size={isSmall ? 16 : 20}
      />
      <span className="relative z-10 font-medium text-white/80 transition-colors group-hover:text-white">
        Star
      </span>
      {stars !== null && (
        <>
          <div className="h-4 w-px bg-white/20" />
          <div className="relative z-10 flex items-center gap-1">
            <Star
              className="text-yellow-400 fill-yellow-400"
              size={isSmall ? 12 : 14}
            />
            <span className="font-semibold text-white/90 tabular-nums">
              {formatStars(stars)}
            </span>
          </div>
        </>
      )}
    </a>
  );
};
