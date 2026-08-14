import type { GenReport, Session } from "./types";

export type Draft = {
  id: string;
  hash: string;
  createdAt: string;
  sessions: Session[];
};

const KEY = "athena-drafts-v1";
const CURRENT_KEY = "athena-current-schedule-v1";

export function loadDrafts(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Draft[];
  } catch {
    return [];
  }
}

export function pushDraft(hash: string, sessions: Session[]) {
  const next: Draft[] = [{ id: `d-${Date.now()}`, hash, createdAt: new Date().toISOString(), sessions }, ...loadDrafts()].slice(0, 3);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export type ScheduleBundle = { sessions: Session[]; report: GenReport };

// The most recently generated schedule — reloading the page must show this, not a freshly randomized one.
export function loadCurrentSchedule(): ScheduleBundle | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScheduleBundle;
  } catch {
    return null;
  }
}

export function saveCurrentSchedule(bundle: ScheduleBundle) {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(bundle));
  } catch {
    /* storage full or unavailable — schedule still holds in memory */
  }
}
