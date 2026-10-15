export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  return seconds >= 60 ? formatClock(ms) : `${seconds.toFixed(1)}s`;
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d);
}

export function endReasonLabel(reason: 'time' | 'death'): string {
  return reason === 'time' ? 'Time up' : 'Ship sunk';
}
