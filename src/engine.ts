import { DAYS, FORMAT_PRIORITY, FORMATS, LOCATIONS, TIMES, TRAINERS as BASE_TRAINERS } from "./data";
import { hasPerformance, lookupAgg, rankHistoricSlots } from "./performance";
import { overrideBoost } from "./overrides";
import type { Format, GenReport, Location, Session, Settings, Tag, Trainer } from "./types";

function roster(settings: Settings) {
  return settings.trainers?.length ? settings.trainers : BASE_TRAINERS;
}
// Room names that are single-purpose wherever they appear. A location that lists one of these rooms
// but (through stale saved/cloud settings) lost its roomTypes map would otherwise both ban its own
// PowerCycle/Strength formats and hand the dedicated room out to Barre/Mat as generic overflow.
const SPECIALTY_ROOMS: Record<string, "cycle" | "strength"> = {
  "PowerCycle Studio": "cycle",
  "Strength Lab": "strength",
};

function normalizeLocation(loc: Location): Location {
  const roomTypes = { ...(loc.roomTypes ?? {}) };
  for (const room of loc.rooms ?? []) {
    const family = SPECIALTY_ROOMS[room];
    if (family && !roomTypes[family]) roomTypes[family] = room;
  }
  return roomTypes === loc.roomTypes ? loc : { ...loc, roomTypes };
}

// houses() is called inside the innermost placement loops, so the normalized list is cached per
// settings object rather than rebuilt on every call.
const housesCache = new WeakMap<Settings, Location[]>();
function houses(settings: Settings) {
  const cached = housesCache.get(settings);
  if (cached) return cached;
  const list = (settings.locations?.length ? settings.locations : LOCATIONS).map(normalizeLocation);
  housesCache.set(settings, list);
  return list;
}
function catalog(settings: Settings) {
  return settings.formats?.length ? settings.formats : FORMATS;
}

// Fallback defaults used only if settings.limits/bannedFormats is missing (e.g. stale localStorage).
const FALLBACK_LIMITS = { weeklyCap: 15, dailyHourCap: 4, barreMinShare: 0.25, earliestTime: "07:00", latestTime: "20:30", lunchStart: "13:00", lunchEnd: "15:00", sundayEarliest: "10:00" };
const FALLBACK_BANNED_FORMATS = ["Foundations", "Studio Foundations", "SWEAT In 30", "Studio SWEAT In 30", "Hosted", "Hosted Class", "Studio Hosted"];
// A slot needs at least this many current-year-to-date sessions before its historic average is
// trusted enough to force-schedule ahead of everything else.
const TOP_SLOT_MIN_SESSIONS = 4;
// Auto-pinned "proven top performer" slots can't eat more than half a house's scheduled week —
// leaves room for the generic fill/quality passes to still shape the rest of the schedule.
const PINNED_SESSION_SHARE_CAP = 0.5;
function limitsOf(settings: Settings) {
  return settings.limits ?? FALLBACK_LIMITS;
}
function bannedFormatsOf(settings: Settings) {
  return settings.bannedFormats?.length ? settings.bannedFormats : FALLBACK_BANNED_FORMATS;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shiftOf(t: string): "am" | "pm" {
  return toMin(t) < 13 * 60 ? "am" : "pm";
}

const PEAK_TIMES = ["07:15", "07:30", "08:00", "08:15", "08:30", "09:00", "09:15", "17:30", "18:00", "18:15", "18:30", "18:45", "19:00"];
const SATURDAY_AM_TIMES = ["07:15", "07:30", "08:00", "08:15", "08:30", "09:00", "09:15", "10:15", "10:30", "11:00"];
const SUNDAY_LAST_END = 19 * 60;
const PRIME_WINDOWS: Record<string, Record<number, string[]>> = {
  kwality: {
    0: ["08:30", "18:45"],
    1: ["08:30", "19:00"],
    2: ["09:00", "08:00"],
    3: ["09:15", "18:15"],
    4: ["09:00", "17:45"],
    5: ["10:15", "11:30"],
    6: ["11:30", "10:15", "17:15"],
  },
  supreme: {
    0: ["19:30", "11:00"],
    1: ["09:15", "19:00"],
    2: ["19:00", "08:45", "11:00"],
    3: ["09:30", "08:00", "19:15"],
    4: ["09:00", "19:00"],
    5: ["09:00", "11:00", "11:30"],
    6: ["10:00", "10:15", "16:30"],
  },
  kenkere: {
    0: ["18:15", "17:00"],
    1: ["19:15", "19:30", "17:15"],
    2: ["07:15", "18:00", "19:30"],
    3: ["18:15", "19:15"],
    4: ["17:00", "18:15", "07:15"],
    5: ["11:15", "09:15", "10:15"],
    6: ["10:00", "17:00", "11:15"],
  },
};

function shiftTarget(locationId: string) {
  return locationId === "kwality" || locationId === "supreme" ? 0.6 : 0.5;
}

function familyKey(name: string) {
  if (name.includes("PowerCycle")) return "PowerCycle";
  if (name.includes("Barre 57")) return "Barre 57";
  return FORMATS.find((f) => f.name === name)?.fullName ?? name;
}

function isSpecialtyCapacityFormat(format: string) {
  const family = FORMATS.find((f) => f.name === format)?.family;
  return family === "cycle" || family === "strength";
}

function locationDaySessions(sessions: Session[], locationId: string, day: number) {
  return sessions.filter((s) => s.locationId === locationId && s.day === day);
}

function dayCount(sessions: Session[], locationId: string, day: number) {
  return locationDaySessions(sessions, locationId, day).length;
}

function countFormatFamily(sessions: Session[], locationId: string, family: string) {
  return sessions.filter((s) => s.locationId === locationId && familyKey(s.name) === family).length;
}

function hasAdjacentSameFormat(sessions: Session[], locationId: string, day: number, time: string, format: string, excludeId?: string) {
  const start = toMin(time);
  const family = familyKey(format);
  return sessions
    .filter((s) => s.id !== excludeId && s.locationId === locationId && s.day === day)
    .some((s) => {
      // Same family (e.g. Barre 57 / Barre 57 Express) counts too — an express class right
      // next to its full-length sibling reads as redundant back-to-back programming.
      if (familyKey(s.name) !== family) return false;
      const delta = Math.abs(toMin(s.time) - start);
      return delta <= 75;
    });
}

// Zero-history "experimental" placements are capped at 15% of a location's classes so class-mix
// filler never dominates a proven, evidence-backed schedule.
const EXPERIMENTAL_QUOTA = 0.15;
function experimentalQuotaOk(sessions: Session[], locationId: string, settings?: Settings) {
  const exp = sessions.filter((s) => s.locationId === locationId && s.tags.includes("experimental")).length;
  // Sized against the week the location is *aiming* for, not the classes placed so far. Keying it to
  // the running count meant a house that starts empty (Courtside/Copper have zero historic rows, so
  // every candidate is zero-history) allowed exactly one experimental class and then permanently
  // locked itself out at one class for the week.
  const planned = settings
    ? Math.max(
        settings.floors?.[locationId] ?? 0,
        DAYS.reduce((sum, d) => sum + (settings.targets[locationId]?.[d.key]?.target ?? 0), 0)
      )
    : sessions.filter((s) => s.locationId === locationId).length;
  const allowance = Math.max(4, Math.ceil(EXPERIMENTAL_QUOTA * planned));
  return exp < allowance;
}

function allowedTime(day: number, time: string, settings?: Settings) {
  const limits = settings ? limitsOf(settings) : FALLBACK_LIMITS;
  const m = toMin(time);
  if (m < toMin(limits.earliestTime) || m > toMin(limits.latestTime)) return false;
  if (m >= toMin(limits.lunchStart) && m < toMin(limits.lunchEnd)) return false;
  if (day === 6 && m < toMin(limits.sundayEarliest)) return false;
  return true;
}

function allowedEnd(day: number, time: string, duration: number) {
  return day !== 6 || toMin(time) + duration <= SUNDAY_LAST_END;
}

function adjacentWindow(time: string) {
  const target = toMin(time);
  return TIMES.filter((t) => Math.abs(toMin(t) - target) <= 15);
}

export function historicFor(locationId: string, day: number, time: string, format: string, trainerName: string) {
  const any = lookupAgg(locationId, day, time, format, trainerName);
  const sessions = any.sessions;
  const trend = sessions >= 8 ? 4 : sessions >= 4 ? 0 : -6;
  return { checkin: any.checkin, fill: any.fill, trend, sessions, revenue: any.revenue, rows: any.rows, tier: any.tier };
}

// Memoizes historicFor for the duration of a single generateSchedule() run — the same
// (location, day, time, format, trainer) lookup happens hundreds of times per trial.
let historicCache: Map<string, ReturnType<typeof historicFor>> | null = null;
function historicForFast(locationId: string, day: number, time: string, format: string, trainerName: string) {
  if (!historicCache) return historicFor(locationId, day, time, format, trainerName);
  const key = `${locationId}|${day}|${time}|${format}|${trainerName}`;
  let v = historicCache.get(key);
  if (!v) {
    v = historicFor(locationId, day, time, format, trainerName);
    historicCache.set(key, v);
  }
  return v;
}

// Clamp to the same [28, 98] range scoreCombo uses so learned preferences nudge, not override, evidence.
function applyOverrideBoost(score: number, locationId: string, day: number, time: string, format: string, trainerId: string) {
  const boost = overrideBoost(locationId, day, time, format, trainerId);
  return Math.round(Math.min(98, Math.max(28, score + boost)));
}

// Evidence from a weaker match tier is real, but it is not slot-specific — it gets discounted so a
// citywide format average can never outrank a proven, exact-slot combination.
const TIER_CONFIDENCE: Record<string, number> = {
  exact: 1,
  "slot-format": 0.97,
  "nearby-exact": 0.94,
  "nearby-format": 0.9,
  "trainer-format": 0.88,
  "format-day": 0.85,
  "format-time": 0.83,
  "trainer-only": 0.8,
  "format-only": 0.78,
  none: 1,
};

function confidenceOf(tier?: string) {
  return TIER_CONFIDENCE[tier ?? "exact"] ?? 0.8;
}

export function scoreCombo(
  h: { checkin: number; fill: number; trend: number; sessions: number; tier?: string },
  trainer: Trainer,
  settings: Settings,
  format: string
) {
  // Weighted against settings.ai.weight* so tuning happens in Settings, not code.
  const w = settings.ai;
  const fillEquivalentCheckin = isSpecialtyCapacityFormat(format) ? (h.fill / 100) * 10 : h.checkin;
  const attendanceBasis = Math.max(h.checkin, fillEquivalentCheckin);
  const attendance = Math.min(w.weightCheckin * 100, (attendanceBasis / 10) * w.weightCheckin * 100);
  const fill = (h.fill / 100) * w.weightFill * 100;
  const trend = ((h.trend + 6) / 10) * w.weightTrend * 100;
  // A trainer with few personal runs but strong checkin/fill (i.e. slot-level evidence backs them up)
  // shouldn't be treated the same as a truly blind guess — only cap hard when both run count AND
  // performance are weak.
  const strongEvidence = (isSpecialtyCapacityFormat(format) ? h.fill >= 60 : h.checkin >= 10 && h.fill >= 60);
  const oneOff = h.sessions < 4 && !strongEvidence;
  const proven = oneOff ? 0 : Math.min(12, (Math.max(h.sessions, strongEvidence ? 12 : 0) / 40) * 12);
  const tier = ((5 - trainer.tier) / 4) * w.weightTier * 100;
  const combo = FORMAT_PRIORITY[format]?.includes(trainer.id) ? 6 : 0;
  const confidence = confidenceOf(h.tier);
  let score = (attendance + fill + trend + proven) * confidence + tier + combo;
  const preferenceBonus = w.preferTier1 && trainer.tier === 1 ? 2 : 0;
  score += preferenceBonus;
  // The weighted components can add up to ~120 under default settings. Clamping that raw total
  // directly at 98 flattened every strong combination into the same score. Normalize against the
  // configured maximum first so 98 remains exceptional instead of becoming the common ceiling.
  const configuredMaximum = ((w.weightCheckin + w.weightFill + w.weightTrend + w.weightTier) * 100) + 12 + 6 + preferenceBonus;
  score = configuredMaximum > 0 ? (score / configuredMaximum) * 100 : score;
  if (oneOff) score = Math.min(score, 56);
  score = Math.round(Math.min(98, Math.max(28, score)));
  return {
    score,
    oneOff,
    breakdown: {
      attendance: Number(attendance.toFixed(1)),
      fill: Number(fill.toFixed(1)),
      proven: Number(proven.toFixed(1)),
      tier: Number(tier.toFixed(1)),
      combo,
    },
  };
}

export function slotHistory(locationId: string, day: number, time: string) {
  return FORMATS.filter((f) => formatAllowed(locationId, f))
    .flatMap((f) =>
      BASE_TRAINERS.filter((t) => t.active && t.certs[f.cert] && t.access[locationId]).map((t) => {
        const h = historicFor(locationId, day, time, f.name, t.name);
        const sc = scoreCombo(h, t, { ai: { weightCheckin: 0.55, weightFill: 0.3, weightTrend: 0.05, weightTier: 0.1, preferTier1: true, enforceAmPm: true, allowParallel: true, autoPinHigh: true, useAiPass: true, openaiKey: "", openaiModel: "" } } as Settings, f.name);
        return { name: f.name, trainerId: t.id, checkin: h.checkin, fill: h.fill, sessions: h.sessions, score: sc.score, oneOff: sc.oneOff, matchTier: h.tier };
      })
    )
    .filter((x) => !x.oneOff)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function formatAllowed(locationId: string, f: Format, settings?: Settings) {
  const list = settings ? houses(settings) : LOCATIONS;
  const house = list.find((l) => l.id === locationId) || list[0];
  const banned = settings ? bannedFormatsOf(settings) : FALLBACK_BANNED_FORMATS;
  if (banned.some((b) => b.toLowerCase() === f.name.toLowerCase())) return false;
  // A location supports a room-family (cycle/strength) only if it declares a room for it.
  if ((f.family === "cycle" || f.family === "strength") && !house.roomTypes?.[f.family]) return false;
  if (f.studio === "PowerCycle Studio" && !house.rooms.includes("PowerCycle Studio")) return false;
  if (f.studio === "Strength Lab" && !house.rooms.includes("Strength Lab")) return false;
  return true;
}

function roomFor(locationId: string, f: Format, book: Book, day: number, time: string, settings?: Settings) {
  const list = settings ? houses(settings) : LOCATIONS;
  const house = list.find((l) => l.id === locationId);
  const rooms = house?.rooms ?? [];
  const start = toMin(time);
  const end = start + f.duration;
  const free = (room: string) => !overlapsAny(book.roomIntervals[`${locationId}|${day}|${room}`], start, end);
  if (f.family === "cycle" || f.family === "strength") {
    const dedicated = house?.roomTypes?.[f.family];
    // PowerCycle/Strength rooms are single-purpose — never handed out to any other format.
    if (dedicated && rooms.includes(dedicated) && free(dedicated)) return dedicated;
    return null;
  }
  if (rooms.includes(f.studio) && free(f.studio)) return f.studio;
  const fallback = rooms.filter(
    (r) => r !== house?.roomTypes?.strength && r !== house?.roomTypes?.cycle && !SPECIALTY_ROOMS[r]
  );
  return fallback.find((r) => free(r)) ?? null;
}

type Interval = { start: number; end: number };

function overlapsAny(intervals: Interval[] | undefined, start: number, end: number) {
  if (!intervals) return false;
  return intervals.some((iv) => start < iv.end && end > iv.start);
}

type Book = {
  hours: Record<string, number>;
  weekHours: Record<string, number>;
  dayCount: Record<string, number>;
  shift: Record<string, "am" | "pm" | "both">;
  locShift: Record<string, string>;
  dayLocs: Record<string, string[]>;
  formats: Record<string, number>;
  timeline: Record<string, Array<{ time: string; format: string }>>;
  rooms: Set<string>;
  busy: Set<string>;
  trainerIntervals: Record<string, Interval[]>;
  roomIntervals: Record<string, Interval[]>;
  shiftTrainers: Record<string, string[]>;
};

type CandidateOptions = {
  families?: string[];
  names?: string[];
  ignoreMixMax?: boolean;
  allowExperimental?: boolean;
  relaxSoft?: boolean;
};

function emptyBook(): Book {
  return {
    hours: {},
    weekHours: {},
    dayCount: {},
    shift: {},
    locShift: {},
    dayLocs: {},
    formats: {},
    timeline: {},
    rooms: new Set(),
    busy: new Set(),
    trainerIntervals: {},
    roomIntervals: {},
    shiftTrainers: {},
  };
}

function trainerWorkedDays(book: Book, trainerId: string) {
  return Object.keys(book.dayCount)
    .filter((key) => key.startsWith(`${trainerId}|`) && (book.dayCount[key] ?? 0) > 0)
    .map((key) => Number(key.split("|")[1]));
}

const BOUTIQUE = new Set(["courtside", "copper"]);

// ---------------------------------------------------------------------------
// Week offs
//
// Rest days are an output of the schedule, not an input to it. Unless a trainer's week off has been
// set by hand in Settings, the generator picks their days off itself — landing them on the days the
// week can most afford to lose that trainer, which in practice means the quiet weekdays rather than
// Saturday. The seeded weekOff arrays in the trainer data are treated as defaults to be overridden,
// not as a contract.
// ---------------------------------------------------------------------------

function manualOffDays(settings: Settings, trainerId: string) {
  const off = new Set<number>();
  for (const l of settings.leave) if (l.trainerId === trainerId) l.days.forEach((d) => off.add(d));
  for (const l of settings.offDays) if (l.trainerId === trainerId) l.days.forEach((d) => off.add(d));
  return off;
}

function accessDays(t: Trainer) {
  const days = new Set<number>();
  for (const access of Object.values(t.access)) access.days.forEach((d) => days.add(d));
  return days;
}

function computeWeekOffs(settings: Settings): Record<string, number[]> {
  const list = roster(settings);
  const out: Record<string, number[]> = {};
  const desired = Math.max(0, settings.ai.weekOffsPerTrainer ?? 2);

  if (settings.ai.autoWeekOffs === false) {
    for (const t of list) {
      out[t.id] = [...new Set(Object.values(t.access).flatMap((a) => a.weekOff))];
    }
    return out;
  }

  // Trainers whose rest days are fixed are placed first, so the load-based choices below can see
  // the gaps they leave behind.
  const locked = list.filter((t) => t.weekOffLocked);
  const auto = list.filter((t) => !t.weekOffLocked);
  for (const t of locked) out[t.id] = [...new Set(Object.values(t.access).flatMap((a) => a.weekOff))];

  const offOn = (trainerId: string, day: number) =>
    (out[trainerId] ?? []).includes(day) || manualOffDays(settings, trainerId).has(day);

  // Who a house can still call on for a given day, given the offs assigned so far.
  const availableAt = (locationId: string, day: number) =>
    list.filter((t) => t.active && !settings.inactiveTrainers.includes(t.id) && t.access[locationId]?.days.includes(day) && !offOn(t.id, day));

  // Most-constrained trainers choose first: someone available only three days a week has far less
  // room to give than someone available all seven.
  const order = [...auto].sort((a, b) => accessDays(a).size - accessDays(b).size || a.id.localeCompare(b.id));

  for (const t of order) {
    const manual = manualOffDays(settings, t.id);
    const available = [...accessDays(t)].filter((d) => !manual.has(d));
    const need = Math.max(0, desired - manual.size);
    if (need === 0 || !t.active || settings.inactiveTrainers.includes(t.id)) {
      out[t.id] = [...manual];
      continue;
    }
    // Days the trainer is simply not available on already count as rest — no need to spend a
    // deliberate week off on them.
    const unavailable = DAYS.map((d) => d.key).filter((d) => !accessDays(t).has(d));
    const alreadyResting = new Set([...manual, ...unavailable]);
    const stillNeeded = Math.max(0, desired - alreadyResting.size);
    if (stillNeeded === 0) {
      out[t.id] = [...manual];
      continue;
    }
    // Demand = how badly each house needs this trainer that day. A house chasing 12 classes with
    // four eligible trainers left needs them far more than one chasing 6 with ten — and a house
    // whose target simply cannot be met without them needs them more than either.
    const scored = available
      .map((day) => {
        let demand = 0;
        for (const loc of houses(settings)) {
          if (!t.access[loc.id]?.days.includes(day)) continue;
          const target = targetCount(settings, loc.id, day);
          const others = availableAt(loc.id, day).filter((o) => o.id !== t.id);
          demand += target / Math.max(1, others.length + 1);
          // What the house loses by resting this trainer: the classes the remaining roster cannot
          // physically cover. Courtside is staffed by one trainer, so their every access day scores
          // as a total loss and is never given away as a rest day.
          const capacityWithout = others.reduce((sum, o) => sum + Math.min(o.access[loc.id]?.maxPerDay ?? 0, limitsOf(settings).dailyHourCap), 0);
          demand += Math.max(0, target - capacityWithout) * 6;
        }
        // Saturday is the deliberate peak-load day across every house — it is only ever surrendered
        // when a trainer has no other day left to rest on.
        return { day, demand: demand + (day === 5 ? 1000 : 0) };
      })
      .sort((a, b) => a.demand - b.demand || a.day - b.day);

    const picked = scored.slice(0, Math.min(stillNeeded, Math.max(0, available.length - 1))).map((x) => x.day);
    out[t.id] = [...new Set([...manual, ...picked])];
  }
  return out;
}

// Memoized per settings object: the same rest days must hold across every trial of a run, and every
// caller outside the generator (chatbot, manual edits) has to see the same answer.
const weekOffCache = new WeakMap<Settings, Record<string, number[]>>();
export function weekOffsFor(settings: Settings): Record<string, number[]> {
  const cached = weekOffCache.get(settings);
  if (cached) return cached;
  const computed = computeWeekOffs(settings);
  weekOffCache.set(settings, computed);
  return computed;
}

export function weekOffDays(settings: Settings, trainerId: string) {
  return weekOffsFor(settings)[trainerId] ?? [];
}

function canUseTrainer(
  t: Trainer,
  locationId: string,
  day: number,
  time: string,
  duration: number,
  format: Format,
  settings: Settings,
  book: Book,
  opts: { relaxSoft?: boolean } = {}
) {
  if (!t.active || settings.inactiveTrainers.includes(t.id)) return "inactive";
  if (!t.certs[format.cert]) return "uncertified";
  const access = t.access[locationId];
  if (!access) return "no-access";
  if (!access.days.includes(day)) return "unavailable-day";
  // Rest days come from weekOffsFor(), which honours a hand-set week off and otherwise derives one
  // from the week's load — so this is a hard block even in the relaxed repair passes.
  if (weekOffsFor(settings)[t.id]?.includes(day)) return "week-off";
  if (settings.leave.some((l) => l.trainerId === t.id && l.days.includes(day))) return "leave";
  if (settings.offDays.some((l) => l.trainerId === t.id && l.days.includes(day))) return "off-day";
  const tm = toMin(time);
  if (tm < toMin(access.start) || tm > toMin(access.end)) return "window";
  const dayKey = `${t.id}|${day}`;
  const workedDays = trainerWorkedDays(book, t.id);
  // Backstop for the rest-day guarantee: even if every assigned off day is somehow bypassed, a
  // trainer can never be booked onto more than (7 - weekOffsPerTrainer) distinct days.
  const maxWorkingDays = settings.ai.autoWeekOffs === false ? 6 : Math.max(1, 7 - (settings.ai.weekOffsPerTrainer ?? 2));
  const relaxWorkingDays = opts.relaxSoft && settings.ai.autoWeekOffs === false;
  if (!relaxWorkingDays && !workedDays.includes(day) && workedDays.length >= maxWorkingDays) return "week-off-minimum";
  if ((book.dayCount[dayKey] ?? 0) >= access.maxPerDay + (opts.relaxSoft ? 1 : 0)) return "day-class-cap";
  const limits = limitsOf(settings);
  if ((book.hours[dayKey] ?? 0) + duration / 60 > limits.dailyHourCap) return "day-hour-cap";
  // Hard cap, no relaxSoft grace — 15h/week across every location is an absolute ceiling, not a
  // preference a fallback pass is allowed to trade away to fill a gap.
  if ((book.weekHours[t.id] ?? 0) + duration / 60 > limits.weeklyCap) return "week-cap";
  // A trainer can't be in two classes whose time windows overlap, even if they don't share a start time.
  if (overlapsAny(book.trainerIntervals[dayKey], tm, tm + duration)) return "overlap";
  const sh = shiftOf(time);
  const used = book.shift[dayKey];
  const locs = book.dayLocs[dayKey] || [];
  const crossHouse = locs.length > 0 && !locs.includes(locationId);
  // Hard rule: a trainer may only be booked into a second location on the same day if that second
  // location is Copper & Cloves or Courtside, AND its class falls in the same shift as the trainer's
  // other location that day — never a different shift, and never any other location as the second
  // house.
  const boutiqueSecondHouse = crossHouse && BOUTIQUE.has(locationId);
  if (crossHouse && !boutiqueSecondHouse) return "two-locations-day";
  if (boutiqueSecondHouse && used && used !== sh) return "boutique-shift-mismatch";
  if (!opts.relaxSoft && settings.ai.enforceAmPm !== false && used && used !== sh && !boutiqueSecondHouse) return "am-pm-split";
  const locKey = `${t.id}|${day}|${sh}`;
  if (book.locShift[locKey] && book.locShift[locKey] !== locationId && !boutiqueSecondHouse) return "multi-location-shift";
  const cluster = book.shiftTrainers[`${locationId}|${day}|${sh}`] || [];
  // Specialty-room formats (PowerCycle/Strength Lab) run in their own dedicated single room, so
  // they don't compete for the other studios — exempt them from the shift-cluster cap, otherwise
  // generalist trainers monopolize the 3-trainer cluster and specialty trainers never get a slot.
  const clusterExempt = format.family === "cycle" || format.family === "strength";
  if (!opts.relaxSoft && !clusterExempt && settings.ai.clusterTrainers && cluster.length >= (settings.ai.maxTrainersPerShift || 3) && !cluster.includes(t.id)) return "cluster-full";
  return null;
}

function commit(book: Book, t: Trainer, locationId: string, day: number, time: string, duration: number, format: string, room: string) {
  const dayKey = `${t.id}|${day}`;
  const sh = shiftOf(time);
  const start = toMin(time);
  const end = start + duration;
  book.hours[dayKey] = (book.hours[dayKey] ?? 0) + duration / 60;
  book.weekHours[t.id] = (book.weekHours[t.id] ?? 0) + duration / 60;
  book.dayCount[dayKey] = (book.dayCount[dayKey] ?? 0) + 1;
  const used = book.shift[dayKey];
  book.shift[dayKey] = !used ? sh : used === sh ? sh : "both";
  book.locShift[`${t.id}|${day}|${sh}`] = locationId;
  const dl = book.dayLocs[dayKey] || [];
  if (!dl.includes(locationId)) book.dayLocs[dayKey] = [...dl, locationId];
  book.formats[`${locationId}|${format}`] = (book.formats[`${locationId}|${format}`] ?? 0) + 1;
  const tl = book.timeline[`${locationId}|${day}`] || [];
  book.timeline[`${locationId}|${day}`] = [...tl, { time, format }];
  book.rooms.add(`${day}|${time}|${room}`);
  book.busy.add(`${t.id}|${day}|${time}`);
  (book.trainerIntervals[dayKey] ??= []).push({ start, end });
  const roomKey = `${locationId}|${day}|${room}`;
  (book.roomIntervals[roomKey] ??= []).push({ start, end });
  const ck = `${locationId}|${day}|${sh}`;
  const st = book.shiftTrainers[ck] || [];
  if (!st.includes(t.id)) book.shiftTrainers[ck] = [...st, t.id];
}

function rebuildBook(sessions: Session[], settings: Settings) {
  const book = emptyBook();
  for (const s of sessions) {
    const trainer = roster(settings).find((t) => t.id === s.trainerId);
    if (!trainer) continue;
    commit(book, trainer, s.locationId, s.day, s.time, s.duration, s.name, s.studio);
  }
  return book;
}

function uncommit(book: Book, t: Trainer, locationId: string, day: number, time: string, duration: number, format: string, room: string) {
  // Best-effort reversal of commit(): counts/sets/intervals fully unwind; shift/timeline history is
  // left intact (shared bookkeeping, safe to be conservative) so re-checks never allow a double-booking.
  const dayKey = `${t.id}|${day}`;
  const start = toMin(time);
  const end = start + duration;
  book.hours[dayKey] = Math.max(0, (book.hours[dayKey] ?? 0) - duration / 60);
  book.weekHours[t.id] = Math.max(0, (book.weekHours[t.id] ?? 0) - duration / 60);
  book.dayCount[dayKey] = Math.max(0, (book.dayCount[dayKey] ?? 0) - 1);
  book.formats[`${locationId}|${format}`] = Math.max(0, (book.formats[`${locationId}|${format}`] ?? 0) - 1);
  book.busy.delete(`${t.id}|${day}|${time}`);
  book.rooms.delete(`${day}|${time}|${room}`);
  const trainerList = book.trainerIntervals[dayKey];
  if (trainerList) {
    const i = trainerList.findIndex((iv) => iv.start === start && iv.end === end);
    if (i >= 0) trainerList.splice(i, 1);
  }
  const roomList = book.roomIntervals[`${locationId}|${day}|${room}`];
  if (roomList) {
    const i = roomList.findIndex((iv) => iv.start === start && iv.end === end);
    if (i >= 0) roomList.splice(i, 1);
  }
}

function mixOk(locationId: string, name: string, settings: Settings, book: Book, add = 1) {
  const base = familyKey(name);
  const band = settings.mix[locationId]?.[base] ?? settings.mix[locationId]?.[name];
  if (!band) return true;
  const current = catalog(settings)
    .filter((f) => familyKey(f.name) === base)
    .reduce((sum, f) => sum + (book.formats[`${locationId}|${f.name}`] ?? 0), 0);
  return current + add <= band.max;
}

function hardRuleBlocks(settings: Settings, locationId: string, day: number, time: string, format: string, trainerId: string) {
  return settings.customRules.filter((r) => r.enabled && r.priority === "hard").some((r) => {
    if (r.location && r.location !== locationId) return false;
    if (r.trainer && r.trainer !== trainerId) return false;
    if (r.className && r.className !== format) return false;
    if (r.day && r.day !== DAYS[day].full) return false;
    if (r.ruleType === "class_time_restriction" && r.operator === "never") {
      // r.day (if set) is already matched above, so "before r.time" applies to whichever day the rule targets.
      if (r.time && toMin(time) < toMin(r.time)) return true;
      if (r.time && r.time === time) return true;
    }
    if (r.ruleType === "class_location_restriction" && r.operator === "never") return true;
    if (r.ruleType === "trainer_availability" && r.operator === "never") return true;
    return false;
  });
}

function makeSession(
  locationId: string,
  day: number,
  time: string,
  format: Format,
  trainer: Trainer,
  room: string,
  settings: Settings,
  extra: Tag[] = []
): Session {
  const h = historicForFast(locationId, day, time, format.name, trainer.name);
  const scored = scoreCombo(h, trainer, settings, format.name);
  scored.score = applyOverrideBoost(scored.score, locationId, day, time, format.name, trainer.id);
  const tags: Tag[] = [...extra];
  if (scored.score >= 80) tags.push("historic");
  if (scored.score >= 84) tags.push("evidence");
  if (trainer.tier === 1 && scored.score >= 78) tags.push("best");
  if (format.family === "barre") tags.push("mix");
  if (h.fill < settings.quality.fillFloor + 15) tags.push("low"); // watch band scales with the floor, not a fixed absolute gap
  // Reason text must say exactly what evidence was used \u2014 never phrase a broad fallback aggregate as if it were slot-specific.
  const tierText: Record<string, string> = {
    exact: `at ${time} on ${DAYS[day].full}`,
    "trainer-format": `for ${trainer.name} \u00d7 ${format.name} (no history at this exact time/day, using their other slots for this format)`,
    "trainer-only": `for ${trainer.name} at this house (no history with ${format.name} specifically, using their overall record)`,
    "format-only": `for ${format.name} citywide (no history for ${trainer.name} with this format at all)`,
    none: `\u2014 no historic data found for this combination`,
  };
  const reason = extra.includes("experimental")
    ? `Placed with no historic data for ${trainer.name} \u00d7 ${format.name} at this slot — used only to round out class-mix variety, within the 15% experimental quota.`
    : scored.oneOff
      ? "Held only as a last-resort cover — one-off history is ranked below proven combos."
      : `Assigned because ${trainer.name} \u00d7 ${format.name} ${tierText[h.tier] ?? tierText.exact} averages ${h.checkin} check-ins and ${h.fill}% fill across ${h.sessions} historic sessions. Attendance and fill outrank tier.`;
  // Room capacity is set by the venue's actual room, not just the class family — historic
  // attendance for the slot is capped against it so fill% reflects the true room ceiling.
  const house = houses(settings).find((l) => l.id === locationId);
  const roomCapacity = house?.roomCapacity?.[room];
  const capacity = roomCapacity ?? (format.family === "cycle" ? 24 : format.family === "strength" ? 12 : 18);
  return {
    id: `${locationId}-${day}-${time}-${format.name.replace(/\s+/g, "-").toLowerCase()}-${trainer.id}`,
    locationId,
    day,
    time,
    name: format.name,
    studio: room,
    duration: format.duration,
    trainerId: trainer.id,
    score: scored.score,
    fill: h.fill,
    avg: h.checkin,
    sessions: h.sessions,
    matchTier: h.tier,
    oneOff: scored.oneOff,
    reason,
    breakdown: scored.breakdown,
    capacity,
    tags,
    accent: format.accent,
  };
}

export function refreshSessionMetrics(sessions: Session[], settings: Settings) {
  return sessions.map((session) => {
    const format = catalog(settings).find((f) => f.name === session.name);
    const trainer = roster(settings).find((t) => t.id === session.trainerId);
    if (!format || !trainer) return session;
    // Refresh with the same evidence cascade used by generation. Restricting this pass to exact
    // trainer-slot / class-slot matches erased legitimate nearby and format-level evidence after
    // bootstrap, turning data-backed cards into zero-history cards even though generation had
    // scored them correctly moments earlier.
    const matched = lookupAgg(session.locationId, session.day, session.time, format.name, trainer.name);
    const h = {
      checkin: matched.checkin,
      fill: matched.fill,
      trend: matched.sessions >= 8 ? 4 : matched.sessions >= 4 ? 0 : -6,
      sessions: matched.sessions,
      revenue: matched.revenue,
      rows: matched.rows,
      tier: matched.tier,
    };
    const scored = scoreCombo(h, trainer, settings, format.name);
    scored.score = applyOverrideBoost(scored.score, session.locationId, session.day, session.time, format.name, trainer.id);
    const capacity = houses(settings).find((l) => l.id === session.locationId)?.roomCapacity?.[session.studio] ?? session.capacity;
    const tags = session.tags.filter((t) => !["low", "historic", "evidence", "best"].includes(t));
    if (h.sessions > 0) {
      if (scored.score >= 80) tags.push("historic");
      if (scored.score >= 84) tags.push("evidence");
      if (trainer.tier === 1 && scored.score >= 78) tags.push("best");
      if (h.fill < settings.quality.fillFloor + 15) tags.push("low"); // watch band scales with the floor, not a fixed absolute gap
    }
    return {
      ...session,
      score: h.sessions > 0 ? scored.score : 0,
      fill: h.fill,
      avg: h.checkin,
      sessions: h.sessions,
      matchTier: h.tier,
      oneOff: scored.oneOff,
      breakdown: scored.breakdown,
      capacity,
      tags,
      reason: h.sessions > 0
        ? `${trainer.name} × ${format.name} uses ${matchTierDescription(h.tier, session, trainer, format, settings)}: ${h.checkin} avg check-ins, ${h.fill}% fill across ${h.sessions} runs.`
        : `${format.name} at ${DAYS[session.day].full} ${session.time} needs review because no historical evidence was found after normalization.`,
    };
  });
}

function matchTierDescription(tier: string, session: Session, trainer: Trainer, format: Format, settings: Settings) {
  const house = houses(settings).find((l) => l.id === session.locationId)?.name ?? session.locationId;
  const slot = `${DAYS[session.day].full} ${session.time}`;
  const descriptions: Record<string, string> = {
    exact: `exact trainer and class history for the ${slot} slot at ${house}`,
    "slot-format": `class history for the exact ${slot} slot at ${house}, across instructors`,
    "nearby-exact": `${trainer.name}'s ${format.name} history within 45 minutes of this slot at ${house}`,
    "nearby-format": `${format.name} history within 45 minutes of this slot at ${house}, across instructors`,
    "trainer-format": `${trainer.name}'s ${format.name} history in other slots at ${house}`,
    "format-day": `${format.name} history on ${DAYS[session.day].full}s at ${house}`,
    "format-time": `${format.name} history at ${session.time} on other weekdays at ${house}`,
    "trainer-only": `${trainer.name}'s overall history at ${house}`,
    "format-only": `${format.name} history at this house or elsewhere in the source data`,
  };
  return descriptions[tier] ?? "the best available historical evidence";
}

function pickCandidate(
  locationId: string,
  day: number,
  time: string,
  settings: Settings,
  book: Book,
  rand: () => number,
  optimize: boolean,
  progress = 0,
  relaxed = false,
  opts: CandidateOptions = {}
) {
  const formats = shuffle(
    catalog(settings).filter((f) => {
      if (opts.names?.includes(f.name) && (globalThis as any).DEBUG_ENGINE) {
        const h = settings ? houses(settings) : LOCATIONS;
        const hh = h.find((l) => l.id === locationId);
        console.log("candidate-check", locationId, f.name, "family=", f.family, "roomTypes=", JSON.stringify(hh?.roomTypes), "allowed=", formatAllowed(locationId, f, settings), "mixOk=", mixOk(locationId, f.name, settings, book));
      }
      if (!formatAllowed(locationId, f, settings)) return false;
      if (opts.families?.length && !opts.families.includes(familyKey(f.name))) return false;
      if (opts.names?.length && !opts.names.includes(f.name)) return false;
      if (!opts.ignoreMixMax && !mixOk(locationId, f.name, settings, book)) return false;
      return true;
    }),
    rand
  );
  const trainers = shuffle(
    roster(settings).filter((t) => t.active && !settings.inactiveTrainers.includes(t.id)),
    rand
  );
  const ranked: Array<{ format: Format; trainer: Trainer; room: string; score: number; h: ReturnType<typeof historicFor>; experimental: boolean }> = [];
  for (const format of formats) {
    if (!allowedEnd(day, time, format.duration)) continue;
    if (settings.ai.noConsecutiveFormat !== false) {
      const tl = book.timeline[`${locationId}|${day}`] || [];
      const earlier = [...tl].filter((p) => p.time < time).sort((a, b) => b.time.localeCompare(a.time))[0];
      const later = [...tl].filter((p) => p.time > time).sort((a, b) => a.time.localeCompare(b.time))[0];
      const fam = familyKey(format.name);
      if ((earlier && familyKey(earlier.format) === fam) || (later && familyKey(later.format) === fam)) continue;
    }
    if (hasAdjacentSameFormat(book.timeline[`${locationId}|${day}`]?.map((p, i) => ({
      id: `${i}`,
      locationId,
      day,
      time: p.time,
      name: p.format,
    } as Session)) ?? [], locationId, day, time, format.name)) continue;
    if (format.name === "Recovery" && !(book.timeline[`${locationId}|${day}`] || []).length) continue;
    const room = roomFor(locationId, format, book, day, time, settings);
    if (!room) {
      if ((globalThis as any).DEBUG_ENGINE && (opts.names?.includes(format.name))) console.log("no-room", locationId, day, time, format.name);
      continue;
    }
    for (const trainer of trainers) {
      if (canUseTrainer(trainer, locationId, day, time, format.duration, format, settings, book, { relaxSoft: opts.relaxSoft })) {
        if ((globalThis as any).DEBUG_ENGINE && (opts.names?.includes(format.name))) console.log("blocked", canUseTrainer(trainer, locationId, day, time, format.duration, format, settings, book, { relaxSoft: opts.relaxSoft }), locationId, day, time, format.name, trainer.id);
        continue;
      }
	      if (hardRuleBlocks(settings, locationId, day, time, format.name, trainer.id)) continue;
	      const h = historicForFast(locationId, day, time, format.name, trainer.name);
	      const zeroHistory = hasPerformance() && h.sessions === 0;
	      // A slot/trainer combo with no history at all can only be used to fill out class-mix
	      // variety or genuine experiments — gated by the caller's 15% quota (see opts.allowExperimental).
	      if (zeroHistory && (!relaxed || !opts.allowExperimental)) continue;
	      if (!relaxed && !zeroHistory) {
	        if (hasPerformance() && h.sessions < 4) continue;
        // Clearing either bar is enough — a packed 13-seat room reads as a strong slot even with a
        // modest headcount, and a big room with a strong average check-in is strong even at a
        // middling fill%. Capacity-capped rooms (cycle/strength) judge on fill alone: their checkin
        // count is mechanically ceilinged by the tiny room, so it can never be the qualifying signal.
        const passesQualityFloor = isSpecialtyCapacityFormat(format.name)
          ? h.fill >= settings.quality.fillFloor
          : h.fill >= settings.quality.fillFloor || h.checkin >= settings.quality.checkinFloor;
        if (!passesQualityFloor) continue;
	      }
	      const scored = scoreCombo(h, trainer, settings, format.name);
	      const workedDays = trainerWorkedDays(book, trainer.id);
	      const newWorkingDay = !workedDays.includes(day);
	      const weekOffPenalty = newWorkingDay && workedDays.length >= 5 ? 18 : 0;
	      const score = applyOverrideBoost(scored.score, locationId, day, time, format.name, trainer.id) - weekOffPenalty;
	      if (!relaxed && !zeroHistory && score < settings.quality.minAcceptScore) continue;
      ranked.push({ format, trainer, room, score, h, experimental: zeroHistory });
    }
  }
  const sh = shiftOf(time);
  const onShift = new Set(book.shiftTrainers[`${locationId}|${day}|${sh}`] || []);
  ranked.sort((a, b) => {
    const aOn = onShift.has(a.trainer.id) ? 1 : 0;
    const bOn = onShift.has(b.trainer.id) ? 1 : 0;
    if (bOn !== aOn) return bOn - aOn;
    const aT1 = a.trainer.tier === 1 && (book.weekHours[a.trainer.id] ?? 0) < 13 ? 1 : 0;
    const bT1 = b.trainer.tier === 1 && (book.weekHours[b.trainer.id] ?? 0) < 13 ? 1 : 0;
    if (settings.ai.preferTier1 && bT1 !== aT1) return bT1 - aT1;
    return b.score - a.score;
  });
  if (!ranked.length) return null;
  // Anneal: explore more early in a location/day's fill, exploit (go greedy) as it nears its target.
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const temp = optimize ? 0.3 + (1 - clampedProgress) * 0.35 : 0.55 + (1 - clampedProgress) * 0.7;
  const pool = ranked.slice(0, Math.min(ranked.length, 10));
  const weights = pool.map((p, i) => Math.exp((p.score - pool[0].score) / (8 * temp) - i * 0.08));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[Math.floor(rand() * pool.length)];
}

function targetCount(settings: Settings, locationId: string, day: number) {
  const tgt = settings.targets[locationId]?.[day] ?? { target: 1, max: 2 };
  return Math.max(1, Math.min(tgt.target, tgt.max));
}

function maxCount(settings: Settings, locationId: string, day: number) {
  return settings.targets[locationId]?.[day]?.max ?? 2;
}

function tryAddSession(
  sessions: Session[],
  book: Book,
  settings: Settings,
  rand: () => number,
  locationId: string,
  day: number,
  times: string[],
  opts: { families?: string[]; names?: string[]; force?: boolean; tag?: Tag; relaxSoft?: boolean } = {}
) {
  const shuffled = shuffle(times.filter((t) => allowedTime(day, t, settings)), rand);
  for (const time of shuffled) {
    if (!opts.force && dayCount(sessions, locationId, day) >= maxCount(settings, locationId, day)) return false;
    const pick = pickCandidate(locationId, day, time, settings, book, rand, true, 1, true, {
      families: opts.families,
      names: opts.names,
      ignoreMixMax: opts.force,
      allowExperimental: experimentalQuotaOk(sessions, locationId, settings),
      relaxSoft: opts.relaxSoft,
    });
    if (!pick) continue;
    if (sessions.some((s) => s.locationId === locationId && s.day === day && s.time === time && s.studio === pick.room)) continue;
    if (hasAdjacentSameFormat(sessions, locationId, day, time, pick.format.name)) continue;
    const tags: Tag[] = opts.tag ? [opts.tag] : [];
    if (pick.experimental) tags.push("experimental");
    const s = makeSession(locationId, day, time, pick.format, pick.trainer, pick.room, settings, tags);
    sessions.push(s);
    commit(book, pick.trainer, locationId, day, time, pick.format.duration, pick.format.name, pick.room);
    return true;
  }
  return false;
}

function tryReplaceSession(
  sessions: Session[],
  settings: Settings,
  rand: () => number,
  locationId: string,
  day: number,
  times: string[],
  opts: { families?: string[]; names?: string[]; tag?: Tag } = {}
) {
  const wanted = new Set([...(opts.families ?? []), ...(opts.names ?? []).map(familyKey)]);
  const victims = sessions
    .filter((s) => {
      if (s.locationId !== locationId || s.day !== day || s.pinned || s.tags.includes("protected")) return false;
      if (wanted.size && wanted.has(familyKey(s.name))) return false;
      return true;
    })
    .sort((a, b) => a.score - b.score);
  for (const victim of victims) {
    const idx = sessions.findIndex((s) => s.id === victim.id);
    if (idx < 0) continue;
    const [removed] = sessions.splice(idx, 1);
    const book = rebuildBook(sessions, settings);
    if (tryAddSession(sessions, book, settings, rand, locationId, day, times, opts)) return true;
    sessions.splice(idx, 0, removed);
  }
  return false;
}

function repairRequiredShiftCoverage(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings)) {
    for (const day of DAYS) {
      for (const family of ["Barre 57", "PowerCycle"]) {
        if (family === "PowerCycle" && !loc.roomTypes?.cycle) continue;
        for (const sh of ["am", "pm"] as const) {
          const has = locationDaySessions(sessions, loc.id, day.key).some((s) => familyKey(s.name) === family && shiftOf(s.time) === sh);
          if (has) continue;
          const times = TIMES.filter((t) => shiftOf(t) === sh);
          if (tryAddSession(sessions, book, settings, rand, loc.id, day.key, times, { families: [family], tag: "constraint" })) added += 1;
          else if (tryReplaceSession(sessions, settings, rand, loc.id, day.key, times, { families: [family], tag: "constraint" })) {
            book = rebuildBook(sessions, settings);
            added += 1;
          }
        }
      }
    }
  }
  return added;
}

function repairMixMinimums(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings)) {
    const mix = settings.mix[loc.id] || {};
    for (const [name, band] of Object.entries(mix)) {
      const desired = loc.id === "kwality" && name === "Strength Lab" ? Math.max(band.min, 8) : band.min;
      const current = countFormatFamily(sessions, loc.id, familyKey(name));
      let missing = Math.max(0, desired - current);
      let guard = 0;
      let failStreak = 0;
      // A single all-days failure used to abandon the whole band fill; now we only give up
      // after repeated consecutive misses (or the guard budget is exhausted), so a reshuffled
      // day order gets more chances to land a slot for sparse-history formats like PowerCycle/Strength Lab.
      while (missing > 0 && guard < 40 && failStreak < 10) {
        guard += 1;
        const dayOrder = shuffle([...DAYS].sort((a, b) => dayCount(sessions, loc.id, a.key) - dayCount(sessions, loc.id, b.key)), rand);
        let placed = false;
        for (const day of dayOrder) {
          const ratio = shiftTarget(loc.id);
          const list = locationDaySessions(sessions, loc.id, day.key);
          const am = list.filter((s) => shiftOf(s.time) === "am").length;
          const preferAm = list.length ? am / list.length < ratio : true;
          const times = TIMES.filter((t) => shiftOf(t) === (preferAm ? "am" : "pm"));
          placed = tryAddSession(sessions, book, settings, rand, loc.id, day.key, times, { names: [name], tag: "mix" });
          if (!placed) {
            placed = tryReplaceSession(sessions, settings, rand, loc.id, day.key, times, { names: [name], tag: "mix" });
            if (placed) book = rebuildBook(sessions, settings);
          }
          if (placed) break;
        }
        if (!placed) {
          failStreak += 1;
          continue;
        }
        failStreak = 0;
        added += 1;
        missing -= 1;
      }
    }
  }
  return added;
}

function repairSaturdayPriority(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings)) {
    let saturday = dayCount(sessions, loc.id, 5);
    const maxOther = Math.max(...DAYS.filter((d) => d.key !== 5).map((d) => dayCount(sessions, loc.id, d.key)));
    // Saturday is the peak-load day: it must beat every other day and is pushed all the way to its
    // configured max, not merely brought level with the busiest weekday.
    const goal = maxCount(settings, loc.id, 5);
    let guard = 0;
    while (saturday < goal && guard < 24) {
      guard += 1;
      const families = loc.roomTypes?.cycle
        ? ["Barre 57", "PowerCycle", "Mat 57", "FIT", "Cardio Barre"]
        : ["Barre 57", "Mat 57", "FIT", "Cardio Barre"];
      // AM is the Saturday priority, but once those slots are exhausted the rest of the grid is
      // fair game — capping it at AM-only is what held Saturday to a handful of classes.
      const placed =
        tryAddSession(sessions, book, settings, rand, loc.id, 5, SATURDAY_AM_TIMES, { families, tag: "constraint" }) ||
        tryAddSession(sessions, book, settings, rand, loc.id, 5, TIMES, { families, tag: "constraint" }) ||
        tryAddSession(sessions, book, settings, rand, loc.id, 5, TIMES, { families, tag: "constraint", relaxSoft: true }) ||
        (saturday < maxOther && tryReplaceSession(sessions, settings, rand, loc.id, 5, SATURDAY_AM_TIMES, { families, tag: "constraint" }));
      if (!placed) break;
      book = rebuildBook(sessions, settings);
      saturday = dayCount(sessions, loc.id, 5);
      added += 1;
    }
  }
  return added;
}

function repairDailyTargets(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  const dayOrder = [...DAYS].sort((a, b) => {
    const weekendA = a.key >= 5 ? 1 : 0;
    const weekendB = b.key >= 5 ? 1 : 0;
    return weekendB - weekendA || a.key - b.key;
  });
  for (const loc of houses(settings)) {
    for (const day of dayOrder) {
      let current = dayCount(sessions, loc.id, day.key);
      const target = targetCount(settings, loc.id, day.key);
      let guard = 0;
      while (current < target && guard < 12) {
        guard += 1;
        const ratio = shiftTarget(loc.id);
        const list = locationDaySessions(sessions, loc.id, day.key);
        const am = list.filter((s) => shiftOf(s.time) === "am").length;
        const preferAm = list.length ? am / list.length < ratio : day.key >= 5;
        const preferredTimes = day.key === 5
          ? SATURDAY_AM_TIMES
          : TIMES.filter((t) => shiftOf(t) === (preferAm ? "am" : "pm"));
        const families = loc.id === "kwality"
          ? ["Strength Lab", "PowerCycle", "Barre 57", "Mat 57", "FIT"]
          : loc.roomTypes?.cycle
            ? ["PowerCycle", "Barre 57", "Mat 57", "FIT"]
            : ["Barre 57", "Mat 57", "FIT", "Cardio Barre"];
        if (
          !tryAddSession(sessions, book, settings, rand, loc.id, day.key, preferredTimes, { families, tag: "constraint" }) &&
          !tryAddSession(sessions, book, settings, rand, loc.id, day.key, TIMES, { families, tag: "constraint" }) &&
          !tryAddSession(sessions, book, settings, rand, loc.id, day.key, preferredTimes, { families, tag: "constraint", relaxSoft: true }) &&
          !tryAddSession(sessions, book, settings, rand, loc.id, day.key, TIMES, { families, tag: "constraint", relaxSoft: true }) &&
          !tryReplaceSession(sessions, settings, rand, loc.id, day.key, TIMES, { families, tag: "constraint" })
        ) break;
        book = rebuildBook(sessions, settings);
        current = dayCount(sessions, loc.id, day.key);
        added += 1;
      }
    }
  }
  return added;
}

function repairWeeklyFloors(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings)) {
    const floor = settings.floors?.[loc.id] ?? loc.weeklyFloor;
    let current = sessions.filter((s) => s.locationId === loc.id).length;
    let guard = 0;
    while (current < floor && guard < 40) {
      guard += 1;
      const days = shuffle([...DAYS], rand).sort((a, b) => dayCount(sessions, loc.id, a.key) - dayCount(sessions, loc.id, b.key));
      let placed = false;
      for (const day of days) {
        if (dayCount(sessions, loc.id, day.key) >= maxCount(settings, loc.id, day.key)) continue;
        const anchors = PRIME_WINDOWS[loc.id]?.[day.key] ?? PEAK_TIMES;
        const times = [...new Set([...anchors.flatMap(adjacentWindow), ...TIMES])];
        const families = loc.id === "kwality" ? ["Strength Lab", "PowerCycle", "Barre 57", "Mat 57", "FIT"] : loc.roomTypes?.cycle ? ["PowerCycle", "Barre 57", "Mat 57", "FIT"] : ["Barre 57", "Mat 57", "FIT", "Cardio Barre"];
        placed =
          tryAddSession(sessions, book, settings, rand, loc.id, day.key, times, { families, tag: "constraint" }) ||
          tryAddSession(sessions, book, settings, rand, loc.id, day.key, times, { families, tag: "constraint", relaxSoft: true });
        if (placed) break;
      }
      if (!placed) break;
      current = sessions.filter((s) => s.locationId === loc.id).length;
      added += 1;
    }
  }
  return added;
}

function repairPeakParallelSlots(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings).filter((l) => l.rooms.length > 1)) {
    for (const day of DAYS) {
      const anchors = PRIME_WINDOWS[loc.id]?.[day.key] ?? PEAK_TIMES;
      for (const anchor of shuffle(anchors, rand)) {
        const window = adjacentWindow(anchor);
        const families = loc.id === "kwality" ? ["Strength Lab", "PowerCycle", "Barre 57", "Mat 57", "FIT"] : loc.roomTypes?.cycle ? ["PowerCycle", "Barre 57", "Mat 57", "FIT"] : ["Barre 57", "Mat 57", "FIT", "Cardio Barre"];
        const target = loc.id === "kwality" ? Math.min(4, loc.rooms.length) : Math.min(loc.rooms.length, loc.roomTypes?.cycle ? 3 : 2);
        let guard = 0;
        while (dayCount(sessions, loc.id, day.key) < maxCount(settings, loc.id, day.key) && guard < target) {
          guard += 1;
          const current = sessions.filter((s) => s.locationId === loc.id && s.day === day.key && window.includes(s.time)).length;
          if (current >= target) break;
          if (!tryAddSession(sessions, book, settings, rand, loc.id, day.key, window, { families, tag: "constraint" })) break;
          added += 1;
        }
      }
    }
  }
  return added;
}

// Dedicated PowerCycle/Strength Lab rooms sit idle most of the day if left to the generic
// candidate pool — actively try to book them during peak hours first so they run in parallel
// alongside Barre/Mat/FIT rather than only picking up scraps of the schedule.
function repairPeakSpecialtyRooms(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings)) {
    const specialtyFamilies: Array<{ family: string; names: string[] }> = [];
    if (loc.roomTypes?.strength) specialtyFamilies.push({ family: "strength", names: ["Strength Lab"] });
    if (loc.roomTypes?.cycle) specialtyFamilies.push({ family: "cycle", names: ["PowerCycle", "PowerCycle Express"] });
    if (!specialtyFamilies.length) continue;
    for (const day of DAYS) {
      for (const { names } of specialtyFamilies) {
        const anchors = PRIME_WINDOWS[loc.id]?.[day.key] ?? PEAK_TIMES;
        for (const anchor of shuffle(anchors, rand)) {
          const window = adjacentWindow(anchor);
          if (dayCount(sessions, loc.id, day.key) >= maxCount(settings, loc.id, day.key)) continue;
          const already = sessions.some((s) => s.locationId === loc.id && s.day === day.key && window.includes(s.time) && names.includes(s.name));
          if (already) continue;
          if (tryAddSession(sessions, book, settings, rand, loc.id, day.key, window, { names, tag: "constraint" })) added += 1;
        }
      }
    }
  }
  return added;
}

function repairShiftRatios(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings)) {
    for (const day of DAYS) {
      const ratio = shiftTarget(loc.id);
      let list = locationDaySessions(sessions, loc.id, day.key);
      let am = list.filter((s) => shiftOf(s.time) === "am").length;
      let total = list.length;
      let guard = 0;
      while (total < maxCount(settings, loc.id, day.key) && total > 0 && Math.abs(am / total - ratio) > 0.16 && guard < 4) {
        guard += 1;
        const needAm = am / total < ratio;
        const families = loc.id === "kwality" ? ["Strength Lab", "PowerCycle", "Barre 57", "Mat 57", "FIT"] : loc.roomTypes?.cycle ? ["PowerCycle", "Barre 57", "Mat 57", "FIT"] : ["Barre 57", "Mat 57", "FIT", "Cardio Barre"];
        const times = TIMES.filter((t) => shiftOf(t) === (needAm ? "am" : "pm"));
        if (
          !tryAddSession(sessions, book, settings, rand, loc.id, day.key, times, { families, tag: "constraint" }) &&
          !tryReplaceSession(sessions, settings, rand, loc.id, day.key, times, { families, tag: "constraint" })
        ) break;
        book = rebuildBook(sessions, settings);
        added += 1;
        list = locationDaySessions(sessions, loc.id, day.key);
        am = list.filter((s) => shiftOf(s.time) === "am").length;
        total = list.length;
      }
    }
  }
  return added;
}

// Every earlier repair pass optimizes for hitting day/week counts, which can pad a location up to
// its ceiling with sessions that individually squeak past the per-slot floor but drag the location's
// average down well below the 50%-fill / 6-checkin bar the engine is meant to aim for. This pass
// enforces that bar directly on the final schedule: while a location's average is below BOTH
// thresholds, it removes the single weakest non-pinned, non-protected session and re-checks — fewer,
// stronger classes beat a full grid of filler. It never cuts below the location's weekly floor,
// since that is a separate hard requirement; if the two conflict, the floor wins and the location is
// left reporting a quality violation instead of an emptied schedule.
function repairLocationQuality(sessions: Session[], settings: Settings, rand: () => number) {
  let removed = 0;
  for (const loc of houses(settings)) {
    const floor = settings.floors?.[loc.id] ?? loc.weeklyFloor;
    // A location whose real evidence just can't clear the quality bar (Courtside's single trainer,
    // for instance) prunes all the way down to this same floor on every single run, so every
    // generation looked identical for that house no matter the seed. Landing on a random point a
    // little above the floor — never below it — keeps the "aim for the bar" behavior while restoring
    // the run-to-run variety a fresh seed is supposed to produce.
    const stopAt = floor + Math.floor(rand() * 4);
    let guard = 0;
    while (guard < 300) {
      guard += 1;
      const list = sessions.filter((s) => s.locationId === loc.id);
      if (list.length <= stopAt) break;
      const avgFill = list.reduce((a, s) => a + s.fill, 0) / list.length;
      const avgCheckin = list.reduce((a, s) => a + s.avg, 0) / list.length;
      if (avgFill > settings.quality.fillFloor || avgCheckin > settings.quality.checkinFloor) break;
      const victims = list.filter((s) => !s.pinned && !s.tags.includes("protected"));
      if (!victims.length) break;
      // Weakest on whichever of the two metrics the location actually needs — a session that's
      // terrible on both goes first.
      victims.sort((a, b) => a.fill / settings.quality.fillFloor + a.avg / settings.quality.checkinFloor - (b.fill / settings.quality.fillFloor + b.avg / settings.quality.checkinFloor));
      const idx = sessions.findIndex((s) => s.id === victims[0].id);
      if (idx < 0) break;
      sessions.splice(idx, 1);
      removed += 1;
    }
  }
  return removed;
}

function repairCompliance(sessions: Session[], settings: Settings, rand: () => number) {
  let book = rebuildBook(sessions, settings);
  let changes = 0;
  changes += repairMixMinimums(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairRequiredShiftCoverage(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairSaturdayPriority(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairDailyTargets(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairWeeklyFloors(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairPeakSpecialtyRooms(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairPeakParallelSlots(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairShiftRatios(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  // Run last as well: the target/parallel/ratio passes above all add classes to weekdays, which can
  // quietly push a weekday past Saturday after the first Saturday pass has already finished.
  changes += repairSaturdayPriority(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairWeeklyFloors(sessions, book, settings, rand);
  // Absolute last word: prune toward the fill/check-in quality bar after every other pass has
  // finished adding classes, so nothing re-pads the count back up with weak filler afterward.
  changes += repairLocationQuality(sessions, settings, rand);
  return { changes, book: rebuildBook(sessions, settings) };
}

function generateOnce(settings: Settings, seed: number, optimize: boolean, external: Session[] = []) {
  const rand = rng(seed);
  const book = emptyBook();
  const sessions: Session[] = [];

  // A scoped regeneration (only some locations) never touches these sessions, but their trainers'
  // day/week hours are real commitments that still count — without this, a trainer shared between a
  // scoped and an untouched house could get booked into fresh hours here with zero visibility into
  // what they're already carrying elsewhere, blowing past the 15h/week cap once the two halves are
  // merged back together. Marked pinned so no repair pass can touch or remove them; stripped back out
  // of the final result in generateSchedule.
  for (const s of external) {
    const trainer = roster(settings).find((t) => t.id === s.trainerId);
    if (!trainer) continue;
    commit(book, trainer, s.locationId, s.day, s.time, s.duration, s.name, s.studio);
    sessions.push({ ...s, pinned: true });
  }

  for (const pin of settings.pins.filter((p) => p.enabled)) {
    const trainer = roster(settings).find((t) => t.id === pin.trainerId);
    if (!trainer) continue;
    const customKind = pin.kind && pin.kind !== "regular" ? pin.kind : undefined;
    const format = catalog(settings).find((f) => f.name === pin.className) ?? (customKind ? {
      name: pin.className,
      studio: pin.studio || houses(settings).find((l) => l.id === pin.locationId)?.rooms[0] || "Studio 1",
      duration: pin.duration ?? 60,
      accent: customKind === "private" ? "#7c3aed" : "#0891b2",
      cert: pin.cert ?? "barre",
      family: pin.family ?? "special",
    } : null);
    if (!format) continue;
    const room = roomFor(pin.locationId, format, book, pin.day, pin.time, settings);
    if (!room) continue;
    if (!allowedTime(pin.day, pin.time, settings)) continue;
    if (!allowedEnd(pin.day, pin.time, format.duration)) continue;
    if (canUseTrainer(trainer, pin.locationId, pin.day, pin.time, format.duration, format, settings, book)) continue;
    const s = makeSession(pin.locationId, pin.day, pin.time, format, trainer, room, settings, ["protected"]);
    s.pinned = true;
    if (customKind) {
      s.kind = customKind;
      s.tags = [...new Set([...s.tags, customKind])];
      s.score = 0;
      s.fill = 0;
      s.avg = 0;
      s.sessions = 0;
      s.oneOff = false;
      s.reason = `${customKind === "private" ? "Private" : "Hosted"} class pinned from manual schedule.`;
    }
    sessions.push(s);
    commit(book, trainer, pin.locationId, pin.day, pin.time, format.duration, format.name, room);
  }

  // Proven top performers claim their slot before the generic fill loop even starts — ranked by a
  // composite of this-year-to-date avg check-in and fill rate (min TOP_SLOT_MIN_SESSIONS sessions,
  // trainer-agnostic: the slot itself is what's proven, not any one trainer). The best-scoring
  // available trainer for that exact slot is tried first, then the next best, and so on via the same
  // canUseTrainer() gate everything else uses. Quality-floor and class-mix gates are deliberately
  // skipped here — these are proven winners by definition — but certs/hours/leave/room
  // conflicts/hard custom rules still apply since those are physical or contractual, not quality
  // heuristics. Marked pinned so no repair/refine pass downstream can remove one.
  const topSlotNotes: string[] = [];
  for (const loc of houses(settings)) {
    const plannedWeekly = DAYS.reduce((sum, d) => sum + (settings.targets[loc.id]?.[d.key]?.target ?? 0), 0);
    const pinnedCap = Math.floor(plannedWeekly * PINNED_SESSION_SHARE_CAP);
    for (const slot of rankHistoricSlots(TOP_SLOT_MIN_SESSIONS, loc.id)) {
      if (sessions.filter((s) => s.locationId === loc.id && s.pinned).length >= pinnedCap) {
        topSlotNotes.push(
          `${loc.name} · ${DAYS[slot.day].label} ${slot.time} · ${slot.className} — proven top performer skipped: pinned-session cap (${pinnedCap}) reached for this house.`
        );
        continue;
      }
      // slot.className carries the source sheet's raw casing/spacing (via cleanClass()), which does
      // not always match the catalog's canonical name exactly — every other historic lookup in this
      // file normalises before comparing class names; this one must too, or most slots silently fail
      // to resolve a format and get skipped with no note at all.
      const wanted = slot.className.trim().toLowerCase();
      const format = catalog(settings).find((f) => f.name.trim().toLowerCase() === wanted);
      if (!format) continue;
      if (!formatAllowed(loc.id, format, settings)) continue;
      if (!allowedTime(slot.day, slot.time, settings) || !allowedEnd(slot.day, slot.time, format.duration)) continue;
      // Already covered by a pin/external session at this exact slot — nothing left to force.
      if (sessions.some((s) => s.locationId === loc.id && s.day === slot.day && s.time === slot.time && s.name === format.name)) continue;
      const room = roomFor(loc.id, format, book, slot.day, slot.time, settings);
      if (!room) continue;
      const eligible = roster(settings)
        .filter((t) => t.certs[format.cert] && t.access[loc.id])
        .map((t) => ({ trainer: t, score: scoreCombo(historicForFast(loc.id, slot.day, slot.time, format.name, t.name), t, settings, format.name).score }))
        .sort((a, b) => b.score - a.score);
      let placed = false;
      for (const cand of eligible) {
        if (hardRuleBlocks(settings, loc.id, slot.day, slot.time, format.name, cand.trainer.id)) continue;
        if (canUseTrainer(cand.trainer, loc.id, slot.day, slot.time, format.duration, format, settings, book)) continue;
        const s = makeSession(loc.id, slot.day, slot.time, format, cand.trainer, room, settings, ["protected"]);
        s.pinned = true;
        sessions.push(s);
        commit(book, cand.trainer, loc.id, slot.day, slot.time, format.duration, format.name, room);
        placed = true;
        break;
      }
      if (!placed) {
        topSlotNotes.push(
          `${loc.name} · ${DAYS[slot.day].label} ${slot.time} · ${slot.className} — proven top performer (composite ${slot.composite}, ${slot.sessions} sessions this year) could not be scheduled: no eligible trainer.`
        );
      }
    }
  }

  // Reserve PowerCycle/Strength Lab minimums before the generic greedy fill below, which otherwise
  // exhausts the small pool of certified specialist trainers on Barre/Cardio/FIT first and leaves
  // nothing for their own dedicated rooms.
  for (const loc of houses(settings)) {
    const specialtyNames: string[] = [];
    if (loc.roomTypes?.strength) specialtyNames.push("Strength Lab");
    if (loc.roomTypes?.cycle) specialtyNames.push("PowerCycle", "PowerCycle Express");
    for (const name of specialtyNames) {
      const band = settings.mix[loc.id]?.[familyKey(name)] ?? settings.mix[loc.id]?.[name];
      const desired = loc.id === "kwality" && familyKey(name) === "Strength Lab" ? Math.max(band?.min ?? 0, 8) : band?.min ?? 0;
      let guard = 0;
      let failStreak = 0;
      while (countFormatFamily(sessions, loc.id, familyKey(name)) < desired && guard < 40 && failStreak < 10) {
        guard += 1;
        const dayOrder = shuffle([...DAYS], rand);
        let placed = false;
        for (const day of dayOrder) {
          if (dayCount(sessions, loc.id, day.key) >= maxCount(settings, loc.id, day.key)) continue;
          placed = tryAddSession(sessions, book, settings, rand, loc.id, day.key, TIMES, { names: [name], tag: "constraint" });
          if (placed) break;
        }
        failStreak = placed ? 0 : failStreak + 1;
      }
    }
  }

  const order = houses(settings).map((h) => h.id);

  // Filled day-by-day, interleaving the houses instead of finishing one house's whole week before
  // starting the next. Most trainers hold access to two houses but can only work one of them per
  // day, so a location-sequential fill let the first house claim every shared trainer on Monday and
  // left Supreme (whose roster is almost entirely shared with Kwality) unable to reach target.
  // Each round hands the next placement to whichever house is furthest behind its own target.
  for (const day of DAYS) {
    const times = shuffle(TIMES.filter((t) => allowedTime(day.key, t, settings)), rand);
    const plans = order.map((locationId) => {
      const tgt = settings.targets[locationId]?.[day.key] ?? { target: 1, max: 2 };
      const wobble = Math.floor(rand() * 5) - 1;
      const sparseMin = settings.ai.fillSparseHouses !== false && locationId === "supreme" ? (day.key === 6 ? 5 : 8) : 1;
      const want = Math.min(Math.max(optimize ? tgt.target : Math.max(tgt.target, tgt.target + wobble), sparseMin, 1), tgt.max);
      const rooms = houses(settings).find((l) => l.id === locationId)?.rooms.length ?? 1;
      return { locationId, want: Math.min(want, tgt.max), max: tgt.max, rooms, guard: 0, stalled: false };
    });

    const filledFor = (locationId: string) => sessions.filter((s) => s.locationId === locationId && s.day === day.key).length;
    const shortfall = (p: (typeof plans)[number]) => (p.want - filledFor(p.locationId)) / Math.max(1, p.want);

    // Phase 1 — evidence-backed placements, one at a time, neediest house first.
    while (plans.some((p) => !p.stalled && filledFor(p.locationId) < p.want && p.guard < 140)) {
      const queue = plans
        .filter((p) => !p.stalled && filledFor(p.locationId) < p.want && p.guard < 140)
        // Ties go to the smaller house: the boutiques have a single room and, in Courtside's case, a
        // single eligible trainer, so they must claim them before a multi-room house books them out.
        .sort((a, b) => shortfall(b) - shortfall(a) || a.rooms - b.rooms);
      for (const plan of queue) {
        const filled = filledFor(plan.locationId);
        if (filled >= plan.want) continue;
        let placed = false;
        // A house gets a bounded burst of time-slot attempts per turn so one unusable slot doesn't
        // cost it its place in the rotation.
        for (let attempt = 0; attempt < 8 && !placed && plan.guard < 140; attempt++) {
          plan.guard += 1;
          const time = times[plan.guard % times.length];
          if (!settings.ai.allowParallel && book.rooms.has(`${day.key}|${time}|taken-any`)) continue;
          const progress = filled / Math.max(1, plan.want);
          const pick = pickCandidate(plan.locationId, day.key, time, settings, book, rand, optimize || plan.guard > 70, progress);
          if (!pick) continue;
          if (sessions.some((s) => s.locationId === plan.locationId && s.day === day.key && s.time === time && s.studio === pick.room)) continue;
          const s = makeSession(plan.locationId, day.key, time, pick.format, pick.trainer, pick.room, settings);
          sessions.push(s);
          commit(book, pick.trainer, plan.locationId, day.key, time, pick.format.duration, pick.format.name, pick.room);
          placed = true;
        }
        if (!placed && plan.guard >= 140) plan.stalled = true;
      }
      if (queue.length === 0) break;
      // Nothing landed anywhere this round — every remaining house is out of viable slots.
      if (queue.every((p) => filledFor(p.locationId) >= p.want || p.stalled)) break;
      if (plans.every((p) => p.stalled || filledFor(p.locationId) >= p.want)) break;
    }

    // Phase 2 — soft-constraint relaxation: if quality floors left a house short of its target,
    // fill the gap with the best available option instead of silently under-booking, and flag it
    // clearly so it's visible in the UI rather than a hidden shortfall.
    for (const plan of [...plans].sort((a, b) => shortfall(b) - shortfall(a))) {
      let relaxedTries = 0;
      while (filledFor(plan.locationId) < plan.want && relaxedTries < 24) {
        relaxedTries += 1;
        const time = times[(plan.guard + relaxedTries) % times.length];
        const pick = pickCandidate(plan.locationId, day.key, time, settings, book, rand, true, 1, true, {
          allowExperimental: experimentalQuotaOk(sessions, plan.locationId, settings),
        });
        if (!pick) continue;
        if (sessions.some((s) => s.locationId === plan.locationId && s.day === day.key && s.time === time && s.studio === pick.room)) continue;
        const tags: Tag[] = pick.experimental ? ["experimental"] : ["low", "constraint"];
        const s = makeSession(plan.locationId, day.key, time, pick.format, pick.trainer, pick.room, settings, tags);
        sessions.push(s);
        commit(book, pick.trainer, plan.locationId, day.key, time, pick.format.duration, pick.format.name, pick.room);
      }
    }

    // Phase 3 — fill toward max whenever a high-score leftover combo exists. Runs on every generate,
    // not just the explicit "Optimize" pass, so floors/mix targets land as close to max as evidence
    // allows without needing a second manual click. Saturday is the deliberate peak-load day, so it
    // pushes harder and accepts a slightly lower bar than the rest of the week.
    for (const plan of plans) {
      const saturday = day.key === 5;
      const bar = saturday ? 70 : 78;
      const budget = saturday ? 10 : 4;
      let extra = 0;
      while (filledFor(plan.locationId) < plan.max && extra < budget) {
        extra += 1;
        const time = times[(plan.guard + extra) % times.length];
        const pick = pickCandidate(plan.locationId, day.key, time, settings, book, rand, true);
        if (!pick || pick.score < bar) break;
        if (sessions.some((s) => s.locationId === plan.locationId && s.day === day.key && s.time === time && s.studio === pick.room)) continue;
        const s = makeSession(plan.locationId, day.key, time, pick.format, pick.trainer, pick.room, settings);
        sessions.push(s);
        commit(book, pick.trainer, plan.locationId, day.key, time, pick.format.duration, pick.format.name, pick.room);
      }
    }
  }

  // express must have a full-length pair same day
  for (const locationId of order) {
    const locSessions = sessions.filter((s) => s.locationId === locationId);
    for (const s of locSessions) {
      const f = FORMATS.find((x) => x.name === s.name);
      if (f?.express && f.fullName) {
        const hasFull = locSessions.some((o) => o.day === s.day && o.name === f.fullName);
        if (!hasFull) s.tags = [...s.tags, "constraint"];
      }
    }
  }

  const seen = new Set<string>();
  const clean = sessions.filter((s) => {
    const k = `${s.trainerId}|${s.day}|${s.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { sessions: clean, book, topSlotNotes };
}

function evaluate(sessions: Session[], settings: Settings, seed: number, trial: number, trials: number): GenReport {
  const notes: string[] = [];
  const locations = LOCATIONS.map((loc) => {
    const list = sessions.filter((s) => s.locationId === loc.id);
    const barre = list.filter((s) => FORMATS.find((f) => f.name === s.name)?.family === "barre").length;
    const share = list.length ? barre / list.length : 0;
    const violations: string[] = [];
    const floor = settings.floors?.[loc.id] ?? loc.weeklyFloor;
    if (list.length < floor) violations.push(`Below weekly floor ${list.length}/${floor}`);
    const barreMinShare = limitsOf(settings).barreMinShare;
    if (share < barreMinShare && list.length > 4) violations.push(`Barre family ${Math.round(share * 100)}% < ${Math.round(barreMinShare * 100)}%`);
    DAYS.forEach((d) => {
      const n = list.filter((s) => s.day === d.key).length;
      const tgt = settings.targets[loc.id]?.[d.key];
      if (tgt && n < Math.min(tgt.target, tgt.max)) violations.push(`${d.label} below target (${n}/${Math.min(tgt.target, tgt.max)})`);
      if (tgt && n > tgt.max) violations.push(`${d.label} over max (${n}/${tgt.max})`);
      if (d.key === 6 && list.some((s) => s.day === 6 && toMin(s.time) < toMin("10:00"))) violations.push("Sunday class before 10:00");
    });
    const avgScore = list.reduce((a, s) => a + s.score, 0) / (list.length || 1);
    const avgFill = list.reduce((a, s) => a + s.fill, 0) / (list.length || 1);
    const avgCheckin = list.reduce((a, s) => a + s.avg, 0) / (list.length || 1);
    // Clearing either bar counts — see repairLocationQuality, which prunes toward this same target.
    const qualityMet = list.length > 0 && (avgFill > settings.quality.fillFloor || avgCheckin > settings.quality.checkinFloor);
    if (list.length > 0 && !qualityMet) {
      violations.push(`Below quality target: ${avgFill.toFixed(1)}% fill / ${avgCheckin.toFixed(1)} avg check-in (need >${settings.quality.fillFloor}% or >${settings.quality.checkinFloor})`);
    }
    return {
      id: loc.id,
      count: list.length,
      floor,
      floorMet: list.length >= floor,
      avgScore: Number(avgScore.toFixed(1)),
      avgFill: Number(avgFill.toFixed(1)),
      avgCheckin: Number(avgCheckin.toFixed(1)),
      qualityMet,
      barreShare: Number((share * 100).toFixed(1)),
      violations,
    };
  });
  if (locations.every((l) => l.floorMet)) notes.push("All weekly floors met.");
  const weekOffs = weekOffsFor(settings);
  const perTrainer = Math.max(0, settings.ai.weekOffsPerTrainer ?? 2);
  if (settings.ai.autoWeekOffs !== false) {
    const pinned = roster(settings).filter((t) => t.weekOffLocked).length;
    notes.push(
      `${perTrainer} week offs per trainer, placed on the quietest days they are needed${pinned ? ` (${pinned} pinned by hand)` : ""}.`
    );
  }
  notes.push(settings.ai.enforceAmPm ? "AM/PM split enforced." : "AM/PM split off.");
  notes.push(`Quality gate ${settings.quality.checkinFloor} check-ins / ${settings.quality.fillFloor}% fill.`);
  if (!hasPerformance()) {
    notes.unshift("No source-sheet history was loaded for this run — every placement is a blind guess and must be regenerated once real data is available.");
  }
  const blob = sessions.map((s) => `${s.locationId}${s.day}${s.time}${s.name}${s.trainerId}`).join("|");
  return {
    seed,
    hash: hash(blob).toString(16).padStart(8, "0"),
    generatedAt: new Date().toISOString(),
    trials,
    pickedTrial: trial,
    locations,
    notes,
    weekOffs,
    usedPerformanceData: hasPerformance(),
  };
}

function fitness(report: GenReport, sessions: Session[], settings: Settings) {
  const floorPenalty = report.locations.reduce((a, l) => a + (l.floorMet ? 0 : 40), 0);
  const viol = report.locations.reduce((a, l) => a + l.violations.length * 12, 0);
  const avg = sessions.reduce((a, s) => a + s.score, 0) / (sessions.length || 1);
  let coveragePenalty = 0;
  let mixPenalty = 0;
  let saturdayPenalty = 0;
  let ratioPenalty = 0;
  let parallelPenalty = 0;
  let targetPenalty = 0;
  for (const loc of LOCATIONS) {
    for (const day of DAYS) {
      const list = locationDaySessions(sessions, loc.id, day.key);
      const target = targetCount(settings, loc.id, day.key);
      if (list.length < target) targetPenalty += (target - list.length) * (day.key >= 5 ? 24 : 16);
      for (const family of ["Barre 57", "PowerCycle"]) {
        if (family === "PowerCycle" && !loc.roomTypes?.cycle) continue;
        for (const sh of ["am", "pm"] as const) {
          if (!list.some((s) => familyKey(s.name) === family && shiftOf(s.time) === sh)) coveragePenalty += 10;
        }
      }
      if (list.length) {
        const am = list.filter((s) => shiftOf(s.time) === "am").length;
        ratioPenalty += Math.max(0, Math.abs(am / list.length - shiftTarget(loc.id)) - 0.12) * 30;
      }
    }
    const saturday = dayCount(sessions, loc.id, 5);
    const maxOther = Math.max(...DAYS.filter((d) => d.key !== 5).map((d) => dayCount(sessions, loc.id, d.key)));
    if (saturday < maxOther) saturdayPenalty += (maxOther - saturday) * 8;
    for (const [name, band] of Object.entries(settings.mix[loc.id] || {})) {
      const count = countFormatFamily(sessions, loc.id, familyKey(name));
      if (count < band.min) mixPenalty += (band.min - count) * 7;
    }
    if (loc.rooms.length > 1) {
      for (const day of DAYS) {
        for (const time of PEAK_TIMES) {
          const current = sessions.filter((s) => s.locationId === loc.id && s.day === day.key && s.time === time).length;
          if (current === 1) parallelPenalty += loc.id === "kwality" ? 2.5 : 1.5;
        }
      }
    }
  }
  return avg * sessions.length * 0.15 - floorPenalty - viol - coveragePenalty - mixPenalty - saturdayPenalty - ratioPenalty - parallelPenalty - targetPenalty;
}

// Local-search pass: after picking the best trial, try reassigning the weakest sessions to a
// better-scoring available trainer. Greedy hill-climbing, bounded so it stays fast.
function refineSessions(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  const threshold = settings.quality.minAcceptScore + 15;
  const weak = sessions
    .filter((s) => !s.pinned && !s.tags.includes("protected") && s.score < threshold)
    .sort((a, b) => a.score - b.score)
    .slice(0, 25);
  let swaps = 0;
  for (const s of weak) {
    if (swaps >= 15) break;
    const format = catalog(settings).find((f) => f.name === s.name);
    const current = roster(settings).find((t) => t.id === s.trainerId);
    if (!format || !current) continue;
    uncommit(book, current, s.locationId, s.day, s.time, s.duration, s.name, s.studio);
    const candidates = shuffle(
      roster(settings).filter((t) => t.id !== s.trainerId && t.active && !settings.inactiveTrainers.includes(t.id)),
      rand
    );
    let bestAlt: { trainer: Trainer; score: number; h: ReturnType<typeof historicFor> } | null = null;
    for (const trainer of candidates) {
      if (canUseTrainer(trainer, s.locationId, s.day, s.time, format.duration, format, settings, book)) continue;
      if (hardRuleBlocks(settings, s.locationId, s.day, s.time, s.name, trainer.id)) continue;
      const h = historicForFast(s.locationId, s.day, s.time, s.name, trainer.name);
      const scored = scoreCombo(h, trainer, settings, s.name);
      const score = applyOverrideBoost(scored.score, s.locationId, s.day, s.time, s.name, trainer.id);
      if (score > s.score + 4 && (!bestAlt || score > bestAlt.score)) bestAlt = { trainer, score, h };
    }
    const winner = bestAlt ? bestAlt.trainer : current;
    commit(book, winner, s.locationId, s.day, s.time, format.duration, s.name, s.studio);
    if (bestAlt) {
      s.trainerId = bestAlt.trainer.id;
      s.score = bestAlt.score;
      s.fill = bestAlt.h.fill;
      s.avg = bestAlt.h.checkin;
      s.sessions = bestAlt.h.sessions;
      s.reason = `Refined: reassigned to ${bestAlt.trainer.name}, a stronger historic fit for this slot.`;
      swaps += 1;
    }
  }
  return swaps;
}

// locationIds, when given, scopes generation to just those houses — every internal pass reads
// its location list through houses(settings), so swapping settings.locations to the subset is
// enough; callers merge the returned sessions back with their untouched other-location sessions.
// existingElsewhere should be exactly those untouched other-location sessions — a shared trainer's
// hours/day caps otherwise get checked against this scope alone, letting the two halves add up to
// more than 15h/week once the caller merges them back together (see generateOnce).
export function generateSchedule(settings: Settings, seed: number, optimize = false, locationIds?: string[], existingElsewhere: Session[] = []) {
  if ((globalThis as any).DEBUG_ENGINE) {
    console.log("gen-settings-locations", JSON.stringify(settings.locations?.find((l) => l.id === "kwality")));
  }
  const scoped: Settings = locationIds?.length
    ? { ...settings, locations: houses(settings).filter((l) => locationIds.includes(l.id)) }
    : settings;
  const external = locationIds?.length ? existingElsewhere : [];
  const trials = optimize || settings.ai.useAiPass ? 5 : 3;
  historicCache = new Map();
  try {
    let best: ReturnType<typeof generateOnce> | null = null;
    let bestReport: GenReport | null = null;
    let bestFit = -Infinity;
    let picked = 0;
    for (let i = 0; i < trials; i++) {
      const out = generateOnce(scoped, seed + i * 9973, optimize, external);
      const repaired = repairCompliance(out.sessions, scoped, rng(seed + i * 9973 + 313));
      out.book = repaired.book;
      const report = evaluate(out.sessions, settings, seed, i + 1, trials);
      const fit = fitness(report, out.sessions, settings);
      if (fit > bestFit) {
        best = out;
        bestReport = report;
        bestFit = fit;
        picked = i + 1;
      }
    }
    let sessions = best?.sessions ?? [];
    if (best) {
      refineSessions(sessions, best.book, settings, rng(seed + 777));
      best.book = repairCompliance(sessions, scoped, rng(seed + 991)).book;
    }
    // Strip the external sessions back out — they were only ever along for the ride so their
    // trainers' hours got counted; the caller already has them and would otherwise get duplicates.
    if (locationIds?.length) sessions = sessions.filter((s) => locationIds.includes(s.locationId));
    const report = bestReport
      ? { ...evaluate(sessions, settings, seed, picked, trials), pickedTrial: picked }
      : evaluate(sessions, settings, seed, 1, trials);
    if (best?.topSlotNotes.length) report.notes = [...report.notes, ...best.topSlotNotes];
    return { sessions, report };
  } finally {
    historicCache = null;
  }
}

export function complianceFor(sessions: Session[], settings: Settings) {
  return evaluate(sessions, settings, 0, 1, 1);
}

// Guards manual edits (drag/drop, chatbot, paste, manual create) against the same double-booking
// rules the generator itself enforces: one trainer per slot, one class per room per slot \u2014 accounting
// for each class's actual duration, not just an exact matching start time.
export function hasConflict(
  sessions: Session[],
  candidate: { id: string; locationId: string; day: number; time: string; trainerId: string; studio: string; duration?: number },
  excludeId?: string,
  weeklyCapHours = FALLBACK_LIMITS.weeklyCap
): string | null {
  const start = toMin(candidate.time);
  const end = start + (candidate.duration ?? 60);
  let weekHours = (candidate.duration ?? 60) / 60;
  for (const s of sessions) {
    if (s.id === (excludeId ?? candidate.id)) continue;
    if (s.trainerId === candidate.trainerId) weekHours += s.duration / 60;
    if (s.day !== candidate.day) continue;
    const sStart = toMin(s.time);
    const sEnd = sStart + s.duration;
    if (start >= sEnd || end <= sStart) continue;
    if (s.trainerId === candidate.trainerId) return `${trainerById_(s.trainerId)} is already teaching ${s.time}\u2013${DAYS[candidate.day].full} then, overlapping ${candidate.time}.`;
    if (s.locationId === candidate.locationId && s.studio === candidate.studio) return `${candidate.studio} is already booked from ${s.time} on ${DAYS[candidate.day].full}, overlapping ${candidate.time}.`;
  }
  // Same hard 15h/week ceiling the generator enforces, applied to manual drag/drop, paste, and
  // chatbot edits too \u2014 a trainer can't be pushed over the cap just because a human made the move
  // instead of the AI.
  if (weekHours > weeklyCapHours) {
    return `${trainerById_(candidate.trainerId)} would be at ${weekHours.toFixed(1)}h this week, over the ${weeklyCapHours}h cap.`;
  }
  return null;
}

function trainerById_(id: string) {
  return BASE_TRAINERS.find((t) => t.id === id)?.name || id;
}
