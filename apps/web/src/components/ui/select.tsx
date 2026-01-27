import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  icon,
  disabled = false,
  className = "",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
          {icon}
        </div>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full bg-white/5 border border-white/10 rounded-xl py-2.5 ${icon ? "pl-10" : "pl-4"} pr-10 text-white text-left focus:outline-none focus:border-white/20 transition-all ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedOption?.label || placeholder}
      </button>

      <ChevronDown
        className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${isOpen ? "rotate-180" : ""}`}
        size={18}
      />

      {isOpen && (
        <div className="absolute z-20 w-full mt-2 bg-[#101010] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left hover:bg-accent/5 transition-colors flex items-center justify-between group ${
                value === option.value ? "bg-accent/10 hover:bg-accent/10" : ""
              }`}
            >
              <div className="flex-1">
                <div className="text-white font-medium">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {option.description}
                  </div>
                )}
              </div>
              {value === option.value && (
                <Check size={18} className="text-accent ml-2" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
