// Learns from manual trainer swaps so the generator stops repeating corrections users already made.
export type Override = { key: string; fromTrainerId: string; toTrainerId: string; ts: number };

const KEY = "athena-overrides-v1";
let cache: Override[] | null = null;

function read(): Override[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "[]") as Override[];
  } catch {
    cache = [];
  }
  return cache;
}

function slotKey(locationId: string, day: number, time: string, format: string) {
  return `${locationId}|${day}|${time}|${format.toLowerCase()}`;
}

export function recordOverride(locationId: string, day: number, time: string, format: string, fromTrainerId: string, toTrainerId: string) {
  if (!fromTrainerId || !toTrainerId || fromTrainerId === toTrainerId) return;
  const next = [{ key: slotKey(locationId, day, time, format), fromTrainerId, toTrainerId, ts: Date.now() }, ...read()].slice(0, 300);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — boost simply won't persist across reloads */
  }
}

// +boost if this trainer was the manual pick last time this slot came up, -penalty if they were swapped away from.
export function overrideBoost(locationId: string, day: number, time: string, format: string, trainerId: string): number {
  const key = slotKey(locationId, day, time, format);
  const latest = read().find((o) => o.key === key);
  if (!latest) return 0;
  if (latest.toTrainerId === trainerId) return 6;
  if (latest.fromTrainerId === trainerId) return -5;
  return 0;
}
