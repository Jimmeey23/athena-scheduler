import { DAYS, resolveLocationId } from "./data";

export type PerfRow = {
  raw: Record<string, string>;
  trainer: string;
  className: string;
  sourceClass: string;
  location: string;
  locationId: string;
  day: string;
  dayKey: number;
  time: string;
  uniqueId1: string;
  uniqueId2: string;
  capacity: number;
  checkedIn: number;
  lateCancelled: number;
  booked: number;
  revenue: number;
  date: string;
};

export type MatchTier = "exact" | "slot-format" | "trainer-format" | "trainer-only" | "format-only" | "none";

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
  return resolveLocationId(name);
}

export function cleanClass(name: string) {
  const cleaned = name.replace(/^studio\s+/i, "").replace(/\s+/g, " ").trim();
  if (/^strength lab/i.test(cleaned)) return "Strength Lab";
  if (/^trainer'?s choice$/i.test(cleaned)) return "Trainers Choice";
  return cleaned;
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

function norm(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function keyPart(s: string | number) {
  return norm(String(s));
}

export function uniqueKey1(locationId: string, day: number, time: string, className: string) {
  return [cleanClass(className), day, timeHHMM(time), locationId].map(keyPart).join("|");
}

export function uniqueKey2(locationId: string, day: number, time: string, className: string, trainerName: string) {
  return [cleanClass(className), day, timeHHMM(time), locationId, trainerName].map(keyPart).join("|");
}

// A class that hasn't happened yet (future date, or later today) has no attendance evidence —
// it must never be counted as historic data.
function hasOccurred(dateStr: string, time: string): boolean {
  if (!dateStr) return true;
  const dt = new Date(`${dateStr}T${time || "00:00"}`);
  if (Number.isNaN(dt.getTime())) return true;
  return dt.getTime() <= Date.now();
}

export function parseCsv(text: string): PerfRow[] {
  const records = csvRecords(text.replace(/^\uFEFF/, "")).filter(Boolean);
  if (records.length < 2) return [];
  const headers = splitCsv(records[0]).map((h) => h.trim());
  HEADERS = headers;
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iTrainer = idx("Trainer");
  // The source schedule grain is Trainer + Class + Day + Time + Location. "Classes"/"SessionName"
  // are only fallbacks for older exports.
  const iClasses = idx("Classes");
  const iClass = idx("Class");
  const iSessionName = idx("SessionName");
  const iLoc = idx("Location");
  const iDay = idx("Day");
  const iTime = idx("Time");
  const iUnique1 = idx("UniqueID1");
  const iUnique2 = idx("UniqueID2");
  const iCap = idx("Capacity");
  const iIn = idx("CheckedIn");
  const iLate = idx("LateCancelled");
  const iBook = idx("Booked");
  const iRev = idx("Revenue");
  const iDate = idx("Date");
  const rows: PerfRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const c = splitCsv(records[i]);
    const raw = Object.fromEntries(headers.map((h, j) => [h, c[j] || ""]));
    const classCandidates = [c[iClass], c[iClasses], c[iSessionName]].filter((v) => v && !/^\d+(\.\d+)?$/.test(v.trim()));
    const rawClass = classCandidates[0] || "";
    const className = cleanClass(rawClass);
    if (!className || BANNED.test(className) || BANNED.test(rawClass)) continue;
    const trainer = (c[iTrainer] || "").trim();
    if (!trainer) continue;
    const location = c[iLoc] || "";
    // Rows from venues outside our 5 studios (e.g. partner/pop-up locations) don't belong to any house — skip them
    // rather than silently attributing their history to Kwality.
    const locationId = locIdFromName(location);
    if (!locationId) continue;
    const day = c[iDay] || "";
    const time = timeHHMM(c[iTime] || "");
    const date = c[iDate] || "";
    if (!hasOccurred(date, time)) continue;
    const rowDay = dayKey(day);
    rows.push({
      raw,
      trainer,
      className,
      sourceClass: rawClass,
      location,
      locationId,
      day,
      dayKey: rowDay,
      time,
      uniqueId1: (c[iUnique1] || "").trim() || uniqueKey1(locationId, rowDay, time, className),
      uniqueId2: (c[iUnique2] || "").trim() || uniqueKey2(locationId, rowDay, time, className, trainer),
      capacity: Number(c[iCap]) || 18,
      checkedIn: Number(c[iIn]) || 0,
      lateCancelled: Number(c[iLate]) || 0,
      booked: Number(c[iBook]) || 0,
      revenue: Number(c[iRev]) || 0,
      date,
    });
  }
  return rows;
}

function csvRecords(text: string) {
  const records: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      cur += ch;
      if (q && text[i + 1] === '"') {
        cur += text[++i];
        continue;
      }
      q = !q;
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !q) {
      if (cur.trim()) records.push(cur);
      cur = "";
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) records.push(cur);
  return records;
}

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
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
let HEADERS: string[] = [];
const IDX = {
  exact: new Map<string, PerfRow[]>(),
  unique1: new Map<string, PerfRow[]>(),
  unique2: new Map<string, PerfRow[]>(),
  classTrainer: new Map<string, PerfRow[]>(),
  trainerLoc: new Map<string, PerfRow[]>(),
  classOnly: new Map<string, PerfRow[]>(),
  slotFormat: new Map<string, PerfRow[]>(),
};

function push(map: Map<string, PerfRow[]>, key: string, row: PerfRow) {
  const list = map.get(key);
  if (list) {
    if (!list.includes(row)) list.push(row);
  }
  else map.set(key, [row]);
}

export function setPerformanceRows(rows: PerfRow[]) {
  STORE = rows;
  IDX.exact.clear();
  IDX.unique1.clear();
  IDX.unique2.clear();
  IDX.classTrainer.clear();
  IDX.trainerLoc.clear();
  IDX.classOnly.clear();
  IDX.slotFormat.clear();
  for (const r of rows) {
    const cls = norm(r.className);
    const tr = norm(r.trainer);
    push(IDX.exact, `${r.locationId}|${r.dayKey}|${r.time}|${cls}|${tr}`, r);
    push(IDX.slotFormat, `${r.locationId}|${r.dayKey}|${r.time}|${cls}`, r);
    push(IDX.unique1, norm(r.uniqueId1), r);
    push(IDX.unique2, norm(r.uniqueId2), r);
    push(IDX.unique1, uniqueKey1(r.locationId, r.dayKey, r.time, r.className), r);
    push(IDX.unique2, uniqueKey2(r.locationId, r.dayKey, r.time, r.className, r.trainer), r);
    push(IDX.classTrainer, `${r.locationId}|${cls}|${tr}`, r);
    push(IDX.trainerLoc, `${r.locationId}|${tr}`, r);
    push(IDX.classOnly, cls, r);
  }
}

export function lookupExactAgg(locationId: string, day: number, time: string, className: string, trainerName: string) {
  const rows =
    IDX.unique2.get(uniqueKey2(locationId, day, time, className, trainerName)) ||
    IDX.exact.get(`${locationId}|${day}|${timeHHMM(time)}|${norm(className)}|${norm(trainerName)}`) ||
    [];
  return { ...aggregate(rows), tier: "exact" as const };
}

export function lookupSlotFormatAgg(locationId: string, day: number, time: string, className: string) {
  const rows =
    IDX.unique1.get(uniqueKey1(locationId, day, time, className)) ||
    IDX.slotFormat.get(`${locationId}|${day}|${timeHHMM(time)}|${norm(className)}`) ||
    [];
  return { ...aggregate(rows), tier: "slot-format" as const };
}

export function lookupExactRows(locationId: string, day: number, time: string, className: string, trainerName: string) {
  return lookupExactAgg(locationId, day, time, className, trainerName).rows;
}

export function lookupSlotFormatRows(locationId: string, day: number, time: string, className: string) {
  return lookupSlotFormatAgg(locationId, day, time, className).rows;
}

function minutes(time: string) {
  const [h, m] = timeHHMM(time).split(":").map(Number);
  return h * 60 + m;
}

export function lookupAgg(locationId: string, day: number, time: string, className: string, trainerName: string) {
  const cls = norm(className);
  const tr = norm(trainerName);
  const exact = IDX.unique2.get(uniqueKey2(locationId, day, time, className, trainerName)) || IDX.exact.get(`${locationId}|${day}|${timeHHMM(time)}|${cls}|${tr}`);
  const slotFormat = !exact && (IDX.unique1.get(uniqueKey1(locationId, day, time, className)) || IDX.slotFormat.get(`${locationId}|${day}|${timeHHMM(time)}|${cls}`));
  const rows = exact || slotFormat || [];
  const tier: MatchTier = exact
    ? "exact"
    : slotFormat
      ? "slot-format"
      : "none";
  return { ...aggregate(rows), tier };
}

export function getPerformanceRows() {
  return STORE;
}

export function getPerformanceHeaders() {
  return HEADERS;
}

export function hasPerformance() {
  return STORE.length > 0;
}

// Ranks every trainer who has actually taught this class format anywhere, by avg check-in then fill.
export function topTrainersForClass(className: string, limit = 3) {
  const cls = norm(className);
  const byTrainer = new Map<string, PerfRow[]>();
  for (const r of STORE) {
    if (norm(r.className) !== cls) continue;
    const list = byTrainer.get(r.trainer) || [];
    list.push(r);
    byTrainer.set(r.trainer, list);
  }
  return [...byTrainer.entries()]
    .map(([trainer, rows]) => ({ trainer, agg: aggregate(rows) }))
    .filter((x) => x.agg.sessions >= 2)
    .sort((a, b) => b.agg.checkin - a.agg.checkin || b.agg.fill - a.agg.fill)
    .slice(0, limit);
}

export async function loadGoogleSheet(token: string, spreadsheetId: string) {
  // "Teacher Recurring" is class×day×time×location×trainer grain — exactly what lookupAgg needs.
  // "Recurring" is the same grain without trainer (used as the classOnly/no-trainer fallback).
  const ranges = [
    "Teacher Recurring!A1:AG20000",
    "Recurring!A1:AG20000",
    "Sessions!A1:Z20000",
    "Sessions Performance Data!A1:Z20000",
    "Sheet1!A1:Z20000",
  ];
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
