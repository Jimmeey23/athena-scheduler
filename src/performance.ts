import { DAYS, FORMATS, resolveLocationId } from "./data";
import { getClient } from "./supabase";
import type { CertKey, MatchTier, Trainer } from "./types";

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

export type PerfAgg = {
  sessions: number;
  checkin: number;
  fill: number;
  booked: number;
  revenue: number;
  rows: PerfRow[];
};

const BANNED = /hosted|foundations|sweat|junior/i;
// Nothing before this date counts as usable history anywhere in the app — scheduling, rankings, or
// the Source Data reference view.
const HISTORY_FLOOR = "2026-01-01";

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
    if (date && date < HISTORY_FLOOR) continue;
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

// Shared by the Source Data ranking view and the scheduler's top-performer forcing pass, so "top
// slot" means exactly the same thing in both places — min-max normalised so it stays meaningful
// whether ranking 5 slots or 500.
export function computeComposite<T extends { checkin: number; fill: number }>(groups: T[]): Array<T & { composite: number }> {
  if (!groups.length) return [];
  const checkins = groups.map((g) => g.checkin);
  const fills = groups.map((g) => g.fill);
  const minC = Math.min(...checkins);
  const maxC = Math.max(...checkins);
  const minF = Math.min(...fills);
  const maxF = Math.max(...fills);
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 100);
  return groups.map((g) => ({ ...g, composite: Math.round(0.5 * norm(g.checkin, minC, maxC) + 0.5 * norm(g.fill, minF, maxF)) }));
}

// "Historic" for ranking purposes means this calendar year only, strictly before today — last
// year's numbers (or today's still-incomplete day) shouldn't decide what gets force-scheduled now.
export function isCurrentYearToDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const rowYear = Number(dateStr.slice(0, 4));
  if (!rowYear || rowYear !== new Date().getFullYear()) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rowDate = new Date(dateStr);
  if (Number.isNaN(rowDate.getTime())) return false;
  return rowDate.getTime() < today.getTime();
}

export type RankedSlot = {
  locationId: string;
  day: number;
  time: string;
  className: string;
  sessions: number;
  checkin: number;
  fill: number;
  composite: number;
};

// Trainer-agnostic ranking of every location+day+time+class combo actually taught this year to
// date, aggregated across whichever trainers ran it — the basis for "schedule proven winners
// first, then find the best available trainer for them," independent of who happened to teach it
// historically.
export function rankHistoricSlots(minSessions = 4, locationId?: string): RankedSlot[] {
  const rows = STORE.filter((r) => isCurrentYearToDate(r.date) && (!locationId || r.locationId === locationId));
  const groups = new Map<string, PerfRow[]>();
  for (const r of rows) {
    const key = uniqueKey1(r.locationId, r.dayKey, r.time, r.className);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const ranked: Array<Omit<RankedSlot, "composite">> = [];
  for (const group of groups.values()) {
    if (group.length < minSessions) continue;
    const agg = aggregate(group);
    const sample = group[0];
    ranked.push({ locationId: sample.locationId, day: sample.dayKey, time: sample.time, className: sample.className, sessions: agg.sessions, checkin: agg.checkin, fill: agg.fill });
  }
  return computeComposite(ranked).sort((a, b) => b.composite - a.composite);
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

// Live sync: the `google-token` Supabase Edge Function holds the Google client secret and refresh
// token server-side (never in client code) and mints a short-lived access token for the signed-in
// session, which is then used to call the Sheets API directly for this-run-fresh data. Falls back to
// the static snapshot if the function isn't deployed, the caller isn't signed in yet, or Google is
// unreachable — never leaves the app without historic data to score against.
export async function loadPerformanceData(spreadsheetId: string): Promise<PerfRow[]> {
  try {
    const client = getClient();
    if (!client) throw new Error("Supabase not configured");
    const { data, error } = await client.functions.invoke("google-token");
    if (error || !data?.access_token) throw new Error(error?.message ?? "No access token returned");
    return await loadGoogleSheet(data.access_token, spreadsheetId);
  } catch (liveErr) {
    // Logged rather than swallowed — a live-sync failure (not signed in yet, function not
    // reachable, Google error) is expected occasionally and the snapshot fallback below covers it,
    // but silently losing the reason makes "why is data stale/missing" impossible to diagnose.
    console.warn("Live Google Sheet sync failed, falling back to static snapshot:", liveErr);
    try {
      return await loadSnapshotCsv();
    } catch (snapshotErr) {
      console.error("Snapshot fallback also failed:", snapshotErr);
      throw snapshotErr;
    }
  }
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
  // loc|day|class -> every run of that format on that weekday at that house (any time, any trainer).
  classDayLoc: new Map<string, PerfRow[]>(),
  // loc|time|class -> same format at the same clock time on any weekday.
  classTimeLoc: new Map<string, PerfRow[]>(),
  // loc|day|class|trainer -> same, narrowed to one trainer. Powers the ±45min "nearby time" tier.
  classDayLocTrainer: new Map<string, PerfRow[]>(),
  classLoc: new Map<string, PerfRow[]>(),
};

function push(map: Map<string, PerfRow[]>, key: string, row: PerfRow) {
  const list = map.get(key);
  if (list) {
    if (!list.includes(row)) list.push(row);
  }
  else map.set(key, [row]);
}

// Format name (normalized) -> cert key, built once from the static catalog.
const FORMAT_CERT = new Map(FORMATS.map((f) => [norm(f.name), f.cert]));

// Trainer name (normalized) -> session count per cert their history shows. Rebuilt whenever
// performance rows load. Counts, not just presence, because a single row is as likely to be a
// one-off substitute cover as a real qualification — see MIN_HISTORIC_CERT_SESSIONS below.
let HIST_CERTS = new Map<string, Map<CertKey, number>>();

// A trainer needs to show up teaching a format this many times before the source sheet is trusted
// to auto-certify them for it. One stray row (a covered class, a data-entry slip) must not be
// enough to open up a full qualification — that flooded the candidate pool with trainers who were
// never really meant to teach the format, which diluted average fill/check-in across the board.
const MIN_HISTORIC_CERT_SESSIONS = 3;

export function historicCertsFor(trainerName: string) {
  const counts = HIST_CERTS.get(norm(trainerName));
  if (!counts) return [];
  return [...counts.entries()].filter(([, n]) => n >= MIN_HISTORIC_CERT_SESSIONS).map(([c]) => c);
}

// Grants a cert whenever the source sheet proves the trainer actually ran that format — additive
// only, so it fills in gaps in the hand-maintained defaults (or an admin's own edits) without ever
// un-checking a cert someone deliberately turned on. Returns the same array reference when nothing
// changes, so callers can skip a state update.
export function applyHistoricCerts(trainers: Trainer[]): Trainer[] {
  if (!HIST_CERTS.size) return trainers;
  let anyChanged = false;
  const next = trainers.map((t) => {
    const derived = historicCertsFor(t.name);
    if (!derived.length) return t;
    const missing = derived.filter((c) => !t.certs[c]);
    if (!missing.length) return t;
    anyChanged = true;
    return { ...t, certs: { ...t.certs, ...Object.fromEntries(missing.map((c) => [c, true])) } };
  });
  return anyChanged ? next : trainers;
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
  IDX.classDayLoc.clear();
  IDX.classTimeLoc.clear();
  IDX.classDayLocTrainer.clear();
  IDX.classLoc.clear();
  HIST_CERTS = new Map();
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
    push(IDX.classDayLoc, `${r.locationId}|${r.dayKey}|${cls}`, r);
    push(IDX.classTimeLoc, `${r.locationId}|${r.time}|${cls}`, r);
    push(IDX.classDayLocTrainer, `${r.locationId}|${r.dayKey}|${cls}|${tr}`, r);
    push(IDX.classLoc, `${r.locationId}|${cls}`, r);
    const cert = FORMAT_CERT.get(cls);
    if (cert) {
      const counts = HIST_CERTS.get(tr) ?? new Map<CertKey, number>();
      counts.set(cert, (counts.get(cert) ?? 0) + 1);
      HIST_CERTS.set(tr, counts);
    }
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

// How far off the requested start time a historic run can sit and still count as the same slot.
const NEARBY_MINUTES = 45;

function nearby(rows: PerfRow[] | undefined, time: string) {
  if (!rows?.length) return null;
  const target = minutes(time);
  const hit = rows.filter((r) => Math.abs(minutes(r.time) - target) <= NEARBY_MINUTES);
  return hit.length ? hit : null;
}

// Evidence is looked up as a cascade, strongest first. The source schedule grid never lines up
// perfectly with the planning grid (roughly a fifth of historic runs sit at times the planner
// cannot even book), so an exact-time-only lookup declared most viable combinations "no data" and
// starved whole houses — Supreme, and every class at Courtside/Copper, which have no rows at all.
// Weaker tiers are still real evidence; scoreCombo() discounts them by tier instead of discarding.
export function lookupAgg(locationId: string, day: number, time: string, className: string, trainerName: string) {
  const cls = norm(className);
  const tr = norm(trainerName);
  const hhmm = timeHHMM(time);
  const chain: Array<[MatchTier, PerfRow[] | null | undefined]> = [
    ["exact", IDX.unique2.get(uniqueKey2(locationId, day, time, className, trainerName)) || IDX.exact.get(`${locationId}|${day}|${hhmm}|${cls}|${tr}`)],
    ["slot-format", IDX.unique1.get(uniqueKey1(locationId, day, time, className)) || IDX.slotFormat.get(`${locationId}|${day}|${hhmm}|${cls}`)],
    ["format-day", IDX.classDayLoc.get(`${locationId}|${day}|${cls}`)],
    ["format-time", IDX.classTimeLoc.get(`${locationId}|${hhmm}|${cls}`)],
    ["nearby-exact", nearby(IDX.classDayLocTrainer.get(`${locationId}|${day}|${cls}|${tr}`), hhmm)],
    ["nearby-format", nearby(IDX.classDayLoc.get(`${locationId}|${day}|${cls}`), hhmm)],
    ["trainer-format", IDX.classTrainer.get(`${locationId}|${cls}|${tr}`)],
    ["trainer-only", IDX.trainerLoc.get(`${locationId}|${tr}`)],
    ["format-only", IDX.classLoc.get(`${locationId}|${cls}`) || IDX.classOnly.get(cls)],
  ];
  for (const [tier, rows] of chain) {
    if (rows?.length) return { ...aggregate(rows), tier };
  }
  return { ...aggregate([]), tier: "none" as MatchTier };
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
  // "Sessions" (and the two generic fallback names below it) are true one-row-per-occurrence logs —
  // exactly what every aggregation in this file assumes it's grouping. "Recurring" and "Teacher
  // Recurring" LOOK similar (same column headers) but are actually spreadsheet-side rollups — one
  // row per (slot) or (slot, trainer) with pre-computed all-time totals baked in, not per-date
  // occurrences. Grouping THOSE by uniqueId1/uniqueId2 silently counts "how many distinct trainer
  // rollup-rows fall in the date window" instead of real session counts — a large undercount. They're
  // kept only as an absolute last resort, in case a future spreadsheet drops the raw sheet entirely.
  // Open-ended column ranges (no row number) avoid ever silently truncating growing data again.
  const ranges = [
    "Sessions!A:Z",
    "Sessions Performance Data!A:Z",
    "Sheet1!A:Z",
    "Recurring!A:AG",
    "Teacher Recurring!A:AG",
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
