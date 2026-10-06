import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { workspaceInputBareClassName, workspaceInputClassName, workspaceTextareaClassName } from "./workspace-input-styles";

/** Opt-in fields for refreshed product screens; legacy Input stays unchanged. */
export interface WorkspaceInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "default" | "compact";
  variant?: "default" | "bare";
}

export const WorkspaceInput = forwardRef<HTMLInputElement, WorkspaceInputProps>(function WorkspaceInput(
  { className = "", size = "default", variant = "default", ...props }, ref,
) {
  return <input {...props} ref={ref} data-workspace-input={variant} data-field-size={size}
    className={`${variant === "bare" ? workspaceInputBareClassName : workspaceInputClassName} ${className}`} />;
});

export const WorkspaceTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function WorkspaceTextarea(
  { className = "", ...props }, ref,
) {
  return <textarea {...props} ref={ref} data-workspace-input="textarea" className={`${workspaceTextareaClassName} ${className}`} />;
});
