import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      leftIcon,
      rightIcon,
      error,
      fullWidth = true,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "bg-black/20 border rounded-xl text-white placeholder:text-gray-600 focus:outline-none transition-colors";
    const borderStyles = error
      ? "border-red-500/50 focus:border-red-500"
      : "border-white/10 focus:border-white/20";
    const paddingStyles = `${leftIcon ? "pl-10" : "pl-4"} ${rightIcon ? "pr-10" : "pr-4"} py-2.5`;
    const disabledStyles = disabled
      ? "cursor-not-allowed opacity-75"
      : "";

    return (
      <div className={`relative ${fullWidth ? "w-full" : ""}`}>
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={`${baseStyles} ${borderStyles} ${paddingStyles} ${disabledStyles} ${fullWidth ? "w-full" : ""} ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            {rightIcon}
          </div>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
