export function formatDuration(minutes: number): string {
  const wholeMinutes = Math.max(0, Math.floor(minutes));
  if (wholeMinutes < 60) return `${wholeMinutes} ${wholeMinutes === 1 ? "minute" : "minutes"}`;

  const hours = Math.floor(wholeMinutes / 60);
  const remainingMinutes = wholeMinutes % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (remainingMinutes === 0) return hourLabel;
  return `${hourLabel} and ${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`;
}
