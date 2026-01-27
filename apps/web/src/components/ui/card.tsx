import { type ReactNode, type HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: boolean;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  iconClassName?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({
  children,
  padding = true,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-white/2 border border-white/5 rounded-2xl overflow-hidden ${className}`}
      {...props}
    >
      {padding ? <div className="p-6">{children}</div> : children}
    </div>
  );
}

export function CardHeader({
  icon,
  iconClassName = "bg-blue-500/10 text-blue-400",
  title,
  description,
  action,
  className = "",
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={`p-4 sm:p-6 border-b border-white/5 ${className}`}
      {...props}
    >
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className={`p-2 rounded-lg shrink-0 ${iconClassName}`}>
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-medium text-white">
              {title}
            </h3>
            {description && (
              <p className="text-xs sm:text-sm text-gray-500">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export function CardContent({
  children,
  className = "",
  ...props
}: CardContentProps) {
  return (
    <div className={`p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
