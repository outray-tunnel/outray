/** Static counterpart for SSR, reduced motion, and unavailable WebGL. */
export function HeroAuroraFallback({ id }: { id: string }) {
  return (
    <svg className="absolute top-0 right-[-30%] h-full w-[min(1100px,90vw)] opacity-85 transition-opacity duration-500 group-data-[ready=true]/beam:opacity-0 motion-reduce:transition-none max-[767px]:hidden" viewBox="0 0 1000 800" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-aurora`} x1="1" y1="0" x2="0" y2="0">
          <stop stopColor="#7fffc5" stopOpacity="0.5" />
          <stop offset="0.4" stopColor="#47c5bd" stopOpacity="0.3" />
          <stop offset="0.72" stopColor="#9286ee" stopOpacity="0.14" />
          <stop offset="1" stopColor="#9286ee" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-aurora-soft`} x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <g fill="none" stroke={`url(#${id}-aurora)`} filter={`url(#${id}-aurora-soft)`}>
        <path d="M1100 380C800 250 760 570 470 380S200 220-120 320" strokeWidth="110" />
        <path d="M1100 420C820 520 640 290 380 420S100 570-120 460" strokeWidth="70" opacity="0.75" />
        <path d="M1100 400C800 330 680 500 400 390S80 280-120 370" strokeWidth="44" opacity="0.7" />
      </g>
    </svg>
  );
}
