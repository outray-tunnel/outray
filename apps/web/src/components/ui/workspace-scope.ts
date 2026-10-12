/**
 * Workspace density adjustments formerly supplied by descendant CSS rules.
 *
 * Keep the selectors in one static Tailwind string so portaled product UI can
 * opt into the same scale as the main workspace shell.
 */
export const workspaceScopeClassName = [
  String.raw`[&_.text-\[8px\]]:text-[.625rem]/[.875rem]`,
  String.raw`[&_.text-\[9px\]]:text-[.6875rem]/[.9375rem]`,
  String.raw`[&_.text-\[10px\]]:text-[.75rem]/[1rem]`,
  String.raw`[&_.text-\[11px\]]:text-[.8125rem]/[1.125rem]`,
  String.raw`[&_.text-\[12px\]]:text-[.8125rem]/[1.125rem]`,
  "[&_.text-xs]:text-[.8125rem]/[1.125rem]",
  String.raw`[&_.text-\[13px\]]:text-[.875rem]/[1.25rem]`,
  String.raw`[&_.text-\[14px\]]:text-[1rem]/[1.375rem]`,
  String.raw`[&_.text-\[15px\]]:text-[.9375rem]/[1.375rem]`,
  "[&_.text-sm]:text-[.9375rem]/[1.375rem]",
  "[&_.rounded-sm]:rounded-[.5rem]",
  "[&_.rounded-md]:rounded-[.625rem]",
  "[&_.rounded-lg]:rounded-[.75rem]",
  "[&_.rounded-xl]:rounded-[1rem]",
  "[&_.rounded-2xl]:rounded-[1.25rem]",
].join(" ");
