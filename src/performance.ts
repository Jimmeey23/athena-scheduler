import { DAYS, resolveLocationId } from "./data";

export type PerfRow = {
  trainer: string;
  className: string;
  location: string;
  locationId: string;
  day: string;
  dayKey: number;
  time: string;
  capacity: number;
  checkedIn: number;
  booked: number;
  revenue: number;
  date: string;
};

export type PerfAgg = {
  sessions: number;
  checkin: number;
  fill: number;
  booked: number;
  revenue: number;
  rows: PerfRow[];
};

const BANNED = /hosted|foundations|sweat/i;

export const DEFAULT_SHEET_ID = "16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys";
export const SNAPSHOT_CSV =
  "https://raw.githubusercontent.com/Jimmeey23/make-my-schedule/codex/dynamic-schedule-counts/Sessions%20Performance%20Data.csv";

export function locIdFromName(name: string) {
  return resolveLocationId(name) ?? "kwality";
}

export function cleanClass(name: string) {
  return name.replace(/^studio\s+/i, "").replace(/\s+/g, " ").trim();
}

function dayKey(day: string) {
  const i = DAYS.findIndex((d) => d.full.toLowerCase() === day.toLowerCase() || d.label.toLowerCase() === day.slice(0, 3).toLowerCase());
  return i >= 0 ? i : 0;
}

function timeHHMM(raw: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "07:30";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function parseCsv(text: string): PerfRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]).map((h) => h.trim());
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iTrainer = idx("Trainer");
  const iClass = Math.max(idx("Class"), idx("SessionName"));
  const iLoc = idx("Location");
  const iDay = idx("Day");
  const iTime = idx("Time");
  const iCap = idx("Capacity");
  const iIn = idx("CheckedIn");
  const iBook = idx("Booked");
  const iRev = idx("Revenue");
  const iDate = idx("Date");
  const rows: PerfRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i]);
    const className = cleanClass(c[iClass] || "");
    if (!className || BANNED.test(className) || BANNED.test(c[iClass] || "")) continue;
    const trainer = (c[iTrainer] || "").trim();
    if (!trainer) continue;
    const location = c[iLoc] || "";
    rows.push({
      trainer,
      className,
      location,
      locationId: locIdFromName(location),
      day: c[iDay] || "",
      dayKey: dayKey(c[iDay] || ""),
      time: timeHHMM(c[iTime] || ""),
      capacity: Number(c[iCap]) || 18,
      checkedIn: Number(c[iIn]) || 0,
      booked: Number(c[iBook]) || 0,
      revenue: Number(c[iRev]) || 0,
      date: c[iDate] || "",
    });
  }
  return rows;
}

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function aggregate(rows: PerfRow[]): PerfAgg {
  if (!rows.length) return { sessions: 0, checkin: 0, fill: 0, booked: 0, revenue: 0, rows: [] };
  const sessions = rows.length;
  const checkin = rows.reduce((a, r) => a + r.checkedIn, 0) / sessions;
  const fill = rows.reduce((a, r) => a + (r.capacity ? r.checkedIn / r.capacity : 0), 0) / sessions;
  const booked = rows.reduce((a, r) => a + r.booked, 0) / sessions;
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  return { sessions, checkin: Number(checkin.toFixed(1)), fill: Math.round(fill * 100), booked: Number(booked.toFixed(1)), revenue: Math.round(revenue), rows };
}

export function matchRows(
  rows: PerfRow[],
  opts: { locationId?: string; dayKey?: number; time?: string; className?: string; trainer?: string }
) {
  return rows.filter((r) => {
    if (opts.locationId && r.locationId !== opts.locationId) return false;
    if (opts.dayKey != null && r.dayKey !== opts.dayKey) return false;
    if (opts.time && r.time !== opts.time) return false;
    if (opts.className && cleanClass(r.className).toLowerCase() !== cleanClass(opts.className).toLowerCase()) return false;
    if (opts.trainer && r.trainer.toLowerCase() !== opts.trainer.toLowerCase()) return false;
    return true;
  });
}

export async function loadSnapshotCsv() {
  const res = await fetch(SNAPSHOT_CSV);
  if (!res.ok) throw new Error("Could not load source performance sheet");
  return parseCsv(await res.text());
}

let STORE: PerfRow[] = [];
const IDX = {
  exact: new Map<string, PerfRow[]>(),
  classTrainer: new Map<string, PerfRow[]>(),
  trainerLoc: new Map<string, PerfRow[]>(),
  classOnly: new Map<string, PerfRow[]>(),
};

function push(map: Map<string, PerfRow[]>, key: string, row: PerfRow) {
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
}

export function setPerformanceRows(rows: PerfRow[]) {
  STORE = rows;
  IDX.exact.clear();
  IDX.classTrainer.clear();
  IDX.trainerLoc.clear();
  IDX.classOnly.clear();
  for (const r of rows) {
    const cls = r.className.toLowerCase();
    const tr = r.trainer.toLowerCase();
    push(IDX.exact, `${r.locationId}|${r.dayKey}|${r.time}|${cls}|${tr}`, r);
    push(IDX.classTrainer, `${r.locationId}|${cls}|${tr}`, r);
    push(IDX.trainerLoc, `${r.locationId}|${tr}`, r);
    push(IDX.classOnly, cls, r);
  }
}

export function lookupAgg(locationId: string, day: number, time: string, className: string, trainerName: string) {
  const cls = className.toLowerCase();
  const tr = trainerName.toLowerCase();
  const exact = IDX.exact.get(`${locationId}|${day}|${time}|${cls}|${tr}`);
  const ct = exact || IDX.classTrainer.get(`${locationId}|${cls}|${tr}`);
  const tl = ct || IDX.trainerLoc.get(`${locationId}|${tr}`);
  const any = tl || IDX.classOnly.get(cls) || [];
  return aggregate(any);
}

export function getPerformanceRows() {
  return STORE;
}

export function hasPerformance() {
  return STORE.length > 0;
}

export async function loadGoogleSheet(token: string, spreadsheetId: string) {
  const ranges = ["Sessions!A1:Z20000", "Sessions Performance Data!A1:Z20000", "Sheet1!A1:Z20000"];
  let lastErr = "No range worked";
  for (const range of ranges) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      lastErr = await res.text();
      continue;
    }
    const data = await res.json();
    const values: string[][] = data.values || [];
    if (values.length < 2) continue;
    const csv = values.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    return parseCsv(csv);
  }
  throw new Error(lastErr);
}
