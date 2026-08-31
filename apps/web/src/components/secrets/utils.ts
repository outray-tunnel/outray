export function formatSecretDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatSecretDate(value);
}

export function avatarLabel(name?: string | null, email?: string | null): string {
  const value = name || email || "System";
  return (
    value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S"
  );
}

export function formatAuditActor(event: SecretAuditEvent): string {
  if (event.actorName || event.actorEmail) {
    return event.actorName || event.actorEmail || "System";
  }

  if (event.actorType === "machine") {
    const metadata = event.metadata;
    const prefix = [
      metadata?.actorPrefix,
      metadata?.machineTokenPrefix,
      metadata?.tokenPrefix,
      metadata?.prefix,
    ].find((value): value is string => typeof value === "string" && value.length > 0);
    const identifier = prefix || event.actorId;
    return identifier ? `Machine token · ${identifier}` : "Machine token";
  }

  if (event.actorType === "user") {
    return event.actorId ? `User · ${event.actorId}` : "User";
  }

  return "System";
}
import type { SecretAuditEvent } from "@/lib/secrets-client";
