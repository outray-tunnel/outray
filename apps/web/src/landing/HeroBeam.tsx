import styles from "./hero-beam.module.css";

// A deterministic, decorative spotlight: no canvas, random hydration state,
// animation timers, or client-only loading gap.
export function HeroBeam() {
  return (
    <div className={`${styles.beam} ${styles.light}`} aria-hidden="true">
      <svg viewBox="0 0 1400 780" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="hero-beam-light" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="0.4" stopColor="#ddd4ff" stopOpacity="0.11" />
            <stop offset="1" stopColor="#8367c7" stopOpacity="0" />
          </linearGradient>
          <filter id="hero-beam-softness" x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>
        <g fill="url(#hero-beam-light)" filter="url(#hero-beam-softness)">
          <path d="M-100 250 1350 40 1350 740Z" />
          <path d="M-100 250 1330 175 1330 525Z" opacity="0.65" />
          <path d="M-100 250 1250 260 1250 375Z" opacity="0.55" />
        </g>
        <g fill="#e4dfff" className={styles.dust}>
          <circle cx="240" cy="208" r="1.2" /><circle cx="380" cy="330" r="1" />
          <circle cx="535" cy="160" r="1.1" /><circle cx="760" cy="218" r="1.4" />
          <circle cx="920" cy="415" r="1" /><circle cx="1140" cy="310" r="1.1" />
          <circle cx="660" cy="470" r="1.2" /><circle cx="1090" cy="570" r="1" />
        </g>
      </svg>
      <div className={styles.source} />
    </div>
  );
}
