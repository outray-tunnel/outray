import { useRef, useEffect, useState } from "react";

interface ToggleOption<T extends string> {
  value: T;
  label: React.ReactNode;
  activeColor?: string; // bg color when active, e.g., "bg-white" or "bg-accent"
  activeTextColor?: string; // text color when active
}

interface SlidingToggleProps<T extends string> {
  options: [ToggleOption<T>, ToggleOption<T>];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function SlidingToggle<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SlidingToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const button1Ref = useRef<HTMLButtonElement>(null);
  const button2Ref = useRef<HTMLButtonElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 4, width: 0 });

  const activeIndex = value === options[0].value ? 0 : 1;
  const activeOption = options[activeIndex];

  useEffect(() => {
    const updateIndicator = () => {
      const activeRef = activeIndex === 0 ? button1Ref : button2Ref;
      if (activeRef.current && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const buttonRect = activeRef.current.getBoundingClientRect();
        setIndicatorStyle({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
        });
      }
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeIndex]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center p-1 bg-white/5 rounded-full"
    >
      {/* Sliding indicator */}
      <div
        className={`absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-out ${
          activeOption.activeColor || "bg-white"
        }`}
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />
      <button
        ref={button1Ref}
        onClick={() => !disabled && onChange(options[0].value)}
        disabled={disabled}
        className={`relative z-10 px-4 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
          activeIndex === 0
            ? options[0].activeTextColor || "text-black"
            : disabled
              ? "text-gray-600 cursor-not-allowed"
              : "text-gray-400 hover:text-white"
        }`}
      >
        {options[0].label}
      </button>
      <button
        ref={button2Ref}
        onClick={() => !disabled && onChange(options[1].value)}
        disabled={disabled}
        className={`relative z-10 px-4 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
          activeIndex === 1
            ? options[1].activeTextColor || "text-white"
            : disabled
              ? "text-gray-600 cursor-not-allowed"
              : "text-gray-400 hover:text-white"
        }`}
      >
        {options[1].label}
      </button>
    </div>
  );
}
