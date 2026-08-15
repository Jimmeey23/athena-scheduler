import { DAYS, FORMAT_PRIORITY, FORMATS, LOCATIONS, TIMES, TRAINERS as BASE_TRAINERS } from "./data";
import { hasPerformance, lookupAgg, lookupExactAgg, lookupSlotFormatAgg } from "./performance";
import { overrideBoost } from "./overrides";
import type { Format, GenReport, Session, Settings, Tag, Trainer } from "./types";

function roster(settings: Settings) {
  return settings.trainers?.length ? settings.trainers : BASE_TRAINERS;
}
function houses(settings: Settings) {
  return settings.locations?.length ? settings.locations : LOCATIONS;
}
function catalog(settings: Settings) {
  return settings.formats?.length ? settings.formats : FORMATS;
}

// Fallback defaults used only if settings.limits/bannedFormats is missing (e.g. stale localStorage).
const FALLBACK_LIMITS = { weeklyCap: 15, dailyHourCap: 4, barreMinShare: 0.25, earliestTime: "07:00", latestTime: "20:30", lunchStart: "13:00", lunchEnd: "15:00", sundayEarliest: "10:00" };
const FALLBACK_BANNED_FORMATS = ["Foundations", "Studio Foundations", "SWEAT In 30", "Studio SWEAT In 30", "Hosted", "Hosted Class", "Studio Hosted"];
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

function shiftTarget(locationId: string) {
  return locationId === "kwality" || locationId === "supreme" ? 0.6 : 0.5;
}

function familyKey(name: string) {
  if (name.includes("PowerCycle")) return "PowerCycle";
  if (name.includes("Barre 57")) return "Barre 57";
  return FORMATS.find((f) => f.name === name)?.fullName ?? name;
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
function experimentalQuotaOk(sessions: Session[], locationId: string) {
  const total = sessions.filter((s) => s.locationId === locationId).length;
  const exp = sessions.filter((s) => s.locationId === locationId && s.tags.includes("experimental")).length;
  return exp < Math.ceil(EXPERIMENTAL_QUOTA * (total + 1));
}

function allowedTime(day: number, time: string, settings?: Settings) {
  const limits = settings ? limitsOf(settings) : FALLBACK_LIMITS;
  const m = toMin(time);
  if (m < toMin(limits.earliestTime) || m > toMin(limits.latestTime)) return false;
  if (m >= toMin(limits.lunchStart) && m < toMin(limits.lunchEnd)) return false;
  if (day === 6 && m < toMin(limits.sundayEarliest)) return false;
  return true;
}

export function historicFor(locationId: string, day: number, time: string, format: string, trainerId: string) {
  const trainer = BASE_TRAINERS.find((t) => t.id === trainerId);
  const any = lookupAgg(locationId, day, time, format, trainer?.name || trainerId);
  const sessions = any.sessions;
  const trend = sessions >= 8 ? 4 : sessions >= 4 ? 0 : -6;
  return { checkin: any.checkin, fill: any.fill, trend, sessions, revenue: any.revenue, rows: any.rows, tier: any.tier };
}

// Memoizes historicFor for the duration of a single generateSchedule() run — the same
// (location, day, time, format, trainer) lookup happens hundreds of times per trial.
let historicCache: Map<string, ReturnType<typeof historicFor>> | null = null;
function historicForFast(locationId: string, day: number, time: string, format: string, trainerId: string) {
  if (!historicCache) return historicFor(locationId, day, time, format, trainerId);
  const key = `${locationId}|${day}|${time}|${format}|${trainerId}`;
  let v = historicCache.get(key);
  if (!v) {
    v = historicFor(locationId, day, time, format, trainerId);
    historicCache.set(key, v);
  }
  return v;
}

// Clamp to the same [28, 98] range scoreCombo uses so learned preferences nudge, not override, evidence.
function applyOverrideBoost(score: number, locationId: string, day: number, time: string, format: string, trainerId: string) {
  const boost = overrideBoost(locationId, day, time, format, trainerId);
  return Math.round(Math.min(98, Math.max(28, score + boost)));
}

export function scoreCombo(
  h: { checkin: number; fill: number; trend: number; sessions: number },
  trainer: Trainer,
  settings: Settings,
  format: string
) {
  // Weighted against settings.ai.weight* so tuning happens in Settings, not code.
  const w = settings.ai;
  const attendance = Math.min(w.weightCheckin * 100, (h.checkin / 10) * w.weightCheckin * 100);
  const fill = (h.fill / 100) * w.weightFill * 100;
  const trend = ((h.trend + 6) / 10) * w.weightTrend * 100;
  // A trainer with few personal runs but strong checkin/fill (i.e. slot-level evidence backs them up)
  // shouldn't be treated the same as a truly blind guess — only cap hard when both run count AND
  // performance are weak.
  const strongEvidence = h.checkin >= 10 && h.fill >= 60;
  const oneOff = h.sessions < 4 && !strongEvidence;
  const proven = oneOff ? 0 : Math.min(12, (Math.max(h.sessions, strongEvidence ? 12 : 0) / 40) * 12);
  const tier = ((5 - trainer.tier) / 4) * w.weightTier * 100;
  const combo = FORMAT_PRIORITY[format]?.includes(trainer.id) ? 6 : 0;
  let score = attendance + fill + trend + proven + tier + combo;
  if (oneOff) score = Math.min(score, 56);
  if (w.preferTier1 && trainer.tier === 1) score += 2;
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
        const h = historicFor(locationId, day, time, f.name, t.id);
        const sc = scoreCombo(h, t, { ai: { weightCheckin: 0.55, weightFill: 0.3, weightTrend: 0.05, weightTier: 0.1, preferTier1: true, enforceAmPm: true, allowParallel: true, autoPinHigh: true, useAiPass: true, openaiKey: "", openaiModel: "" } } as Settings, f.name);
        return { name: f.name, trainerId: t.id, checkin: h.checkin, fill: h.fill, sessions: h.sessions, score: sc.score, oneOff: sc.oneOff };
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
  const fallback = rooms.filter((r) => r !== house?.roomTypes?.strength && r !== house?.roomTypes?.cycle);
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
  if (access.weekOff.includes(day)) return "week-off";
  if (settings.leave.some((l) => l.trainerId === t.id && l.days.includes(day))) return "leave";
  if (settings.offDays.some((l) => l.trainerId === t.id && l.days.includes(day))) return "off-day";
  const tm = toMin(time);
  if (tm < toMin(access.start) || tm > toMin(access.end)) return "window";
  const dayKey = `${t.id}|${day}`;
  const workedDays = trainerWorkedDays(book, t.id);
  if (!opts.relaxSoft && !workedDays.includes(day) && workedDays.length >= 6) return "week-off-minimum";
  if ((book.dayCount[dayKey] ?? 0) >= access.maxPerDay + (opts.relaxSoft ? 1 : 0)) return "day-class-cap";
  const limits = limitsOf(settings);
  if ((book.hours[dayKey] ?? 0) + duration / 60 > limits.dailyHourCap) return "day-hour-cap";
  if ((book.weekHours[t.id] ?? 0) + duration / 60 > limits.weeklyCap + (opts.relaxSoft ? 2 : 0)) return "week-cap";
  // A trainer can't be in two classes whose time windows overlap, even if they don't share a start time.
  if (overlapsAny(book.trainerIntervals[dayKey], tm, tm + duration)) return "overlap";
  const sh = shiftOf(time);
  const used = book.shift[dayKey];
  if (!opts.relaxSoft && settings.ai.enforceAmPm !== false && used && used !== sh) return "am-pm-split";
  const locs = book.dayLocs[dayKey] || [];
  if (locs.length && !locs.includes(locationId)) {
    const secondOk = BOUTIQUE.has(locationId) && (!settings.ai.boutiqueSameShiftOnly || !used || used === sh);
    if (!secondOk) return "two-locations-day";
  }
  const locKey = `${t.id}|${day}|${sh}`;
  if (book.locShift[locKey] && book.locShift[locKey] !== locationId) return "multi-location-shift";
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
  const h = historicForFast(locationId, day, time, format.name, trainer.id);
  const scored = scoreCombo(h, trainer, settings, format.name);
  scored.score = applyOverrideBoost(scored.score, locationId, day, time, format.name, trainer.id);
  const tags: Tag[] = [...extra];
  if (scored.score >= 80) tags.push("historic");
  if (scored.score >= 84) tags.push("evidence");
  if (trainer.tier === 1 && scored.score >= 78) tags.push("best");
  if (format.family === "barre") tags.push("mix");
  if (h.fill < settings.quality.fillFloor + 8) tags.push("low");
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
    const exact = lookupExactAgg(session.locationId, session.day, session.time, format.name, trainer.name);
    const slotFormat = exact.sessions ? exact : lookupSlotFormatAgg(session.locationId, session.day, session.time, format.name);
    const h = {
      checkin: slotFormat.checkin,
      fill: slotFormat.fill,
      trend: slotFormat.sessions >= 8 ? 4 : slotFormat.sessions >= 4 ? 0 : -6,
      sessions: slotFormat.sessions,
      revenue: slotFormat.revenue,
      rows: slotFormat.rows,
      tier: slotFormat.tier,
    };
    const scored = scoreCombo(h, trainer, settings, format.name);
    scored.score = applyOverrideBoost(scored.score, session.locationId, session.day, session.time, format.name, trainer.id);
    const capacity = houses(settings).find((l) => l.id === session.locationId)?.roomCapacity?.[session.studio] ?? session.capacity;
    const tags = session.tags.filter((t) => !["low", "historic", "evidence", "best"].includes(t));
    if (h.sessions > 0) {
      if (scored.score >= 80) tags.push("historic");
      if (scored.score >= 84) tags.push("evidence");
      if (trainer.tier === 1 && scored.score >= 78) tags.push("best");
      if (h.fill < settings.quality.fillFloor + 8) tags.push("low");
    }
    return {
      ...session,
      score: h.sessions > 0 ? scored.score : 0,
      fill: h.fill,
      avg: h.checkin,
      sessions: h.sessions,
      oneOff: scored.oneOff,
      breakdown: scored.breakdown,
      capacity,
      tags,
      reason: exact.sessions > 0
        ? `${trainer.name} has proven performance for ${format.name} in this exact ${DAYS[session.day].full} ${session.time} slot at ${houses(settings).find((l) => l.id === session.locationId)?.name ?? session.locationId}: ${h.checkin} avg check-ins, ${h.fill}% fill across ${h.sessions} runs.`
        : h.sessions > 0
          ? `${format.name} is a proven fit for this exact ${DAYS[session.day].full} ${session.time} slot at ${houses(settings).find((l) => l.id === session.locationId)?.name ?? session.locationId}: ${h.checkin} avg check-ins, ${h.fill}% fill across ${h.sessions} runs. Trainer-specific evidence was not available for ${trainer.name}.`
          : `${format.name} at ${DAYS[session.day].full} ${session.time} needs review because the expected class-slot history was not found after normalization.`,
    };
  });
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
	      const h = historicForFast(locationId, day, time, format.name, trainer.id);
	      const zeroHistory = hasPerformance() && h.sessions === 0;
	      // A slot/trainer combo with no history at all can only be used to fill out class-mix
	      // variety or genuine experiments — gated by the caller's 15% quota (see opts.allowExperimental).
	      if (zeroHistory && (!relaxed || !opts.allowExperimental)) continue;
	      if (!relaxed && !zeroHistory) {
	        if (hasPerformance() && h.sessions < 4) continue;
        if (h.checkin < settings.quality.checkinFloor || h.fill < settings.quality.fillFloor) continue;
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
      allowExperimental: experimentalQuotaOk(sessions, locationId),
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
    while (saturday < maxOther && saturday < maxCount(settings, loc.id, 5)) {
      const families = loc.roomTypes?.cycle ? ["Barre 57", "PowerCycle"] : ["Barre 57", "Mat 57", "FIT"];
      if (
        !tryAddSession(sessions, book, settings, rand, loc.id, 5, SATURDAY_AM_TIMES, { families, tag: "constraint" }) &&
        !tryReplaceSession(sessions, settings, rand, loc.id, 5, SATURDAY_AM_TIMES, { families, tag: "constraint" })
      ) break;
      book = rebuildBook(sessions, settings);
      saturday += 1;
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

function repairPeakParallelSlots(sessions: Session[], book: Book, settings: Settings, rand: () => number) {
  let added = 0;
  for (const loc of houses(settings).filter((l) => l.rooms.length > 1)) {
    for (const day of DAYS) {
      for (const time of shuffle(PEAK_TIMES, rand)) {
        if (dayCount(sessions, loc.id, day.key) >= maxCount(settings, loc.id, day.key)) continue;
        const current = sessions.filter((s) => s.locationId === loc.id && s.day === day.key && s.time === time).length;
        const target = loc.id === "kwality" ? Math.min(3, loc.rooms.length) : Math.min(2, loc.rooms.length);
        if (current >= target) continue;
        const families = loc.id === "kwality" ? ["Strength Lab", "PowerCycle", "Barre 57", "Mat 57", "FIT"] : loc.roomTypes?.cycle ? ["PowerCycle", "Barre 57", "Mat 57", "FIT"] : ["Barre 57", "Mat 57", "FIT", "Cardio Barre"];
        if (tryAddSession(sessions, book, settings, rand, loc.id, day.key, [time], { families, tag: "constraint" })) added += 1;
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
        for (const time of shuffle(PEAK_TIMES, rand)) {
          if (dayCount(sessions, loc.id, day.key) >= maxCount(settings, loc.id, day.key)) continue;
          const already = sessions.some((s) => s.locationId === loc.id && s.day === day.key && s.time === time && names.includes(s.name));
          if (already) continue;
          if (tryAddSession(sessions, book, settings, rand, loc.id, day.key, [time], { names, tag: "constraint" })) added += 1;
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
  changes += repairPeakSpecialtyRooms(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairPeakParallelSlots(sessions, book, settings, rand);
  book = rebuildBook(sessions, settings);
  changes += repairShiftRatios(sessions, book, settings, rand);
  return { changes, book: rebuildBook(sessions, settings) };
}

function generateOnce(settings: Settings, seed: number, optimize: boolean) {
  const rand = rng(seed);
  const book = emptyBook();
  const sessions: Session[] = [];

  for (const pin of settings.pins.filter((p) => p.enabled)) {
    const format = catalog(settings).find((f) => f.name === pin.className);
    const trainer = roster(settings).find((t) => t.id === pin.trainerId);
    if (!format || !trainer) continue;
    const room = roomFor(pin.locationId, format, book, pin.day, pin.time, settings);
    if (!room) continue;
    if (!allowedTime(pin.day, pin.time, settings)) continue;
    if (canUseTrainer(trainer, pin.locationId, pin.day, pin.time, format.duration, format, settings, book)) continue;
    const s = makeSession(pin.locationId, pin.day, pin.time, format, trainer, room, settings, ["protected"]);
    s.pinned = true;
    sessions.push(s);
    commit(book, trainer, pin.locationId, pin.day, pin.time, format.duration, format.name, room);
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
  for (const locationId of order) {
    const loc = houses(settings).find((l) => l.id === locationId)!;
    for (const day of DAYS) {
      const tgt = settings.targets[locationId]?.[day.key] ?? { target: 1, max: 2 };
      const wobble = Math.floor(rand() * 5) - 1;
      const sparseMin = settings.ai.fillSparseHouses !== false && locationId === "supreme" ? (day.key === 6 ? 5 : 8) : 1;
      const want = Math.min(Math.max(optimize ? tgt.target : Math.max(tgt.target, tgt.target + wobble), sparseMin, 1), tgt.max);
      const cap = tgt.max;
      const times = shuffle(
        TIMES.filter((t) => allowedTime(day.key, t, settings)),
        rand
      );
      let guard = 0;
      while (sessions.filter((s) => s.locationId === locationId && s.day === day.key).length < Math.min(want, cap) && guard < 140) {
        guard += 1;
        const time = times[guard % times.length];
        if (!settings.ai.allowParallel && book.rooms.has(`${day.key}|${time}|taken-any`)) continue;
        const filled = sessions.filter((s) => s.locationId === locationId && s.day === day.key).length;
        const progress = filled / Math.max(1, Math.min(want, cap));
        const pick = pickCandidate(locationId, day.key, time, settings, book, rand, optimize || guard > 70, progress);
        if (!pick) continue;
        if (sessions.some((s) => s.locationId === locationId && s.day === day.key && s.time === time && s.studio === pick.room)) continue;
        const s = makeSession(locationId, day.key, time, pick.format, pick.trainer, pick.room, settings);
        sessions.push(s);
        commit(book, pick.trainer, locationId, day.key, time, pick.format.duration, pick.format.name, pick.room);
      }
      // Soft-constraint relaxation: if quality floors left the location short of its target,
      // fill the gap with the best available option instead of silently under-booking, and
      // flag it clearly so it's visible in the UI rather than a hidden shortfall.
      let relaxedTries = 0;
      while (
        sessions.filter((s) => s.locationId === locationId && s.day === day.key).length < want &&
        relaxedTries < 20
      ) {
        relaxedTries += 1;
        const time = times[(guard + relaxedTries) % times.length];
        const pick = pickCandidate(locationId, day.key, time, settings, book, rand, true, 1, true, {
          allowExperimental: experimentalQuotaOk(sessions, locationId),
        });
        if (!pick) continue;
        if (sessions.some((s) => s.locationId === locationId && s.day === day.key && s.time === time && s.studio === pick.room)) continue;
        const tags: Tag[] = pick.experimental ? ["experimental"] : ["low", "constraint"];
        const s = makeSession(locationId, day.key, time, pick.format, pick.trainer, pick.room, settings, tags);
        sessions.push(s);
        commit(book, pick.trainer, locationId, day.key, time, pick.format.duration, pick.format.name, pick.room);
      }
      // Fill toward max whenever a high-score leftover combo exists — runs on every
      // generate, not just the explicit "Optimize" pass, so floors/mix targets land
      // as close to max as evidence allows without needing a second manual click.
      {
        let extra = 0;
        while (sessions.filter((s) => s.locationId === locationId && s.day === day.key).length < tgt.max && extra < 4) {
          extra += 1;
          const time = times[(guard + extra) % times.length];
          const pick = pickCandidate(locationId, day.key, time, settings, book, rand, true);
          if (!pick || pick.score < 78) break;
          const s = makeSession(locationId, day.key, time, pick.format, pick.trainer, pick.room, settings);
          sessions.push(s);
          commit(book, pick.trainer, locationId, day.key, time, pick.format.duration, pick.format.name, pick.room);
        }
      }
    }

    // express must have a full-length pair same day
    const locSessions = sessions.filter((s) => s.locationId === locationId);
    for (const s of locSessions) {
      const f = FORMATS.find((x) => x.name === s.name);
      if (f?.express && f.fullName) {
        const hasFull = locSessions.some((o) => o.day === s.day && o.name === f.fullName);
        if (!hasFull) s.tags = [...s.tags, "constraint"];
      }
    }

    void loc;
  }

  const seen = new Set<string>();
  const clean = sessions.filter((s) => {
    const k = `${s.trainerId}|${s.day}|${s.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { sessions: clean, book };
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
    return {
      id: loc.id,
      count: list.length,
      floor,
      floorMet: list.length >= floor,
      avgScore: Number(avgScore.toFixed(1)),
      barreShare: Number((share * 100).toFixed(1)),
      violations,
    };
  });
  if (locations.every((l) => l.floorMet)) notes.push("All weekly floors met.");
  notes.push(settings.ai.enforceAmPm ? "AM/PM split enforced." : "AM/PM split off.");
  notes.push(`Quality gate ${settings.quality.checkinFloor} check-ins / ${settings.quality.fillFloor}% fill.`);
  const blob = sessions.map((s) => `${s.locationId}${s.day}${s.time}${s.name}${s.trainerId}`).join("|");
  return {
    seed,
    hash: hash(blob).toString(16).padStart(8, "0"),
    generatedAt: new Date().toISOString(),
    trials,
    pickedTrial: trial,
    locations,
    notes,
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
      const h = historicForFast(s.locationId, s.day, s.time, s.name, trainer.id);
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

export function generateSchedule(settings: Settings, seed: number, optimize = false) {
  if ((globalThis as any).DEBUG_ENGINE) {
    console.log("gen-settings-locations", JSON.stringify(settings.locations?.find((l) => l.id === "kwality")));
  }
  const trials = optimize || settings.ai.useAiPass ? 5 : 3;
  historicCache = new Map();
  try {
    let best: ReturnType<typeof generateOnce> | null = null;
    let bestReport: GenReport | null = null;
    let bestFit = -Infinity;
    let picked = 0;
    for (let i = 0; i < trials; i++) {
      const out = generateOnce(settings, seed + i * 9973, optimize);
      const repaired = repairCompliance(out.sessions, settings, rng(seed + i * 9973 + 313));
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
    const sessions = best?.sessions ?? [];
    if (best) {
      refineSessions(sessions, best.book, settings, rng(seed + 777));
      best.book = repairCompliance(sessions, settings, rng(seed + 991)).book;
    }
    const report = bestReport
      ? { ...evaluate(sessions, settings, seed, picked, trials), pickedTrial: picked }
      : evaluate(sessions, settings, seed, 1, trials);
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
  excludeId?: string
): string | null {
  const start = toMin(candidate.time);
  const end = start + (candidate.duration ?? 60);
  for (const s of sessions) {
    if (s.id === (excludeId ?? candidate.id)) continue;
    if (s.day !== candidate.day) continue;
    const sStart = toMin(s.time);
    const sEnd = sStart + s.duration;
    if (start >= sEnd || end <= sStart) continue;
    if (s.trainerId === candidate.trainerId) return `${trainerById_(s.trainerId)} is already teaching ${s.time}\u2013${DAYS[candidate.day].full} then, overlapping ${candidate.time}.`;
    if (s.locationId === candidate.locationId && s.studio === candidate.studio) return `${candidate.studio} is already booked from ${s.time} on ${DAYS[candidate.day].full}, overlapping ${candidate.time}.`;
  }
  return null;
}

function trainerById_(id: string) {
  return BASE_TRAINERS.find((t) => t.id === id)?.name || id;
}
