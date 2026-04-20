export function formatPlayTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "";
  if (totalSeconds < 60) return "< 1m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
