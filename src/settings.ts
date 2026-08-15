import { DAYS, FORMATS, LOCATIONS, TRAINERS } from "./data";
import type { Pin, Settings } from "./types";

const KEY = "athena-control-settings-v3";

const dayTargets = (rows: Array<[number, number]>): Record<number, { target: number; max: number }> =>
  Object.fromEntries(DAYS.map((d, i) => [d.key, { target: rows[i][0], max: rows[i][1] }]));

const pin = (id: string, locationId: string, day: number, time: string, className: string, trainerId: string, note: string): Pin => ({
  id,
  locationId,
  day,
  time,
  className,
  trainerId,
  note,
  enabled: true,
});

export const DEFAULT_SETTINGS: Settings = {
  targets: {
    kwality: dayTargets([
      [11, 14],
      [10, 14],
      [10, 14],
      [11, 15],
      [10, 14],
      [12, 17],
      [6, 10],
    ]),
    supreme: dayTargets([
      [10, 14],
      [10, 14],
      [9, 14],
      [10, 15],
      [9, 14],
      [12, 18],
      [6, 10],
    ]),
    kenkere: dayTargets([
      [9, 12],
      [9, 10],
      [7, 12],
      [8, 9],
      [8, 10],
      // Saturday is the peak-load day everywhere; Kenkere's old band topped out below its own
      // Monday max, so no amount of repair could make Saturday the busiest day of its week.
      [11, 14],
      [6, 7],
    ]),
    // Courtside is staffed by Kajol alone, and her access days are Mon/Wed/Fri/Sat/Sun — Tuesday and
    // Thursday cannot be covered at all, so they carry a target of 0 instead of a permanent
    // violation. Saturday absorbs the difference, which also keeps it the week's peak day. Max sits
    // one class above target on every coverable day (rather than target === max) so there is real
    // headroom for a run to land above the floor — target === max everywhere left zero room for the
    // per-day wobble to have any effect, so every single generation produced the exact same count.
    courtside: dayTargets([
      [1, 2],
      [0, 1],
      [1, 2],
      [0, 1],
      [1, 2],
      [2, 3],
      [1, 2],
    ]),
    copper: dayTargets([
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 3],
      [2, 3],
      [2, 3],
    ]),
  },
  mix: {
    kwality: {
      "Barre 57": { min: 18, max: 22 },
      "Cardio Barre": { min: 9, max: 12 },
      "Mat 57": { min: 8, max: 11 },
      PowerCycle: { min: 15, max: 17 },
      "Strength Lab": { min: 8, max: 12 },
      FIT: { min: 12, max: 15 },
      "Amped Up!": { min: 1, max: 2 },
      HIIT: { min: 1, max: 2 },
      "Back Body Blaze": { min: 0, max: 3 },
      Recovery: { min: 0, max: 2 },
    },
    supreme: {
      "Barre 57": { min: 16, max: 20 },
      "Cardio Barre": { min: 8, max: 11 },
      "Mat 57": { min: 7, max: 10 },
      PowerCycle: { min: 12, max: 16 },
      FIT: { min: 10, max: 14 },
      "Amped Up!": { min: 1, max: 2 },
      HIIT: { min: 1, max: 2 },
      "Back Body Blaze": { min: 0, max: 3 },
    },
    kenkere: {
      "Barre 57": { min: 14, max: 18 },
      "Cardio Barre": { min: 8, max: 11 },
      "Mat 57": { min: 8, max: 12 },
      FIT: { min: 8, max: 12 },
    },
    courtside: { "Barre 57": { min: 3, max: 6 }, FIT: { min: 1, max: 3 } },
    copper: { "Barre 57": { min: 3, max: 6 }, "Mat 57": { min: 2, max: 4 } },
  },
  pins: [
    pin("p1", "kwality", 0, "07:15", "Strength Lab", "reshma", "Historic Monday open"),
    pin("p2", "kwality", 0, "08:30", "Mat 57", "atulan", "High-performance historic"),
    pin("p3", "kwality", 0, "18:45", "Barre 57", "rohan", "PM Barre cover"),
    pin("p4", "kwality", 1, "07:30", "FIT", "anisha", "Anisha AM FIT"),
    pin("p5", "kwality", 1, "08:30", "Amped Up!", "pranjali", "Amped historic"),
    pin("p6", "kwality", 1, "11:00", "Mat 57", "anisha", "Midday Mat"),
    pin("p7", "kwality", 1, "19:00", "FIT", "mrigakshi", "PM FIT"),
    pin("p8", "kwality", 2, "07:30", "Cardio Barre", "atulan", "Wed cardio"),
    pin("p9", "kwality", 2, "07:30", "Strength Lab", "anisha", "Parallel strength"),
    pin("p10", "kwality", 2, "09:00", "Back Body Blaze", "anisha", "BBB historic"),
    pin("p11", "kwality", 3, "18:00", "PowerCycle", "simonelle", "Thu cycle"),
    pin("p12", "kwality", 4, "09:00", "FIT", "anisha", "Fri FIT"),
    pin("p13", "kwality", 5, "09:00", "FIT", "reshma", "Sat FIT"),
    pin("p14", "kwality", 5, "10:15", "Mat 57", "karanvir", "Sat Mat"),
    pin("p15", "kwality", 6, "11:30", "Barre 57", "mrigakshi", "Sun Barre"),
    pin("p16", "supreme", 5, "09:00", "Barre 57", "karanvir", "Supreme Saturday"),
    pin("p17", "supreme", 1, "09:15", "FIT", "richard", "Richard FIT"),
  ],
  customRules: [
    {
      id: "r-sun",
      ruleType: "class_time_restriction",
      day: "Sunday",
      time: "10:00",
      operator: "never",
      value: 0,
      priority: "hard",
      enabled: true,
    },
  ],
  inactiveTrainers: [],
  leave: [],
  offDays: [],
  trainers: structuredClone(TRAINERS),
  locations: structuredClone(LOCATIONS),
  formats: structuredClone(FORMATS),
  floors: Object.fromEntries(LOCATIONS.map((l) => [l.id, l.weeklyFloor])),
  bannedFormats: ["Foundations", "Studio Foundations", "SWEAT In 30", "Studio SWEAT In 30", "Hosted", "Hosted Class", "Studio Hosted"],
  // Each location's classes must clear fill% or avg check-in on their own — not both — so a single
  // low number never disqualifies an otherwise strong slot.
  quality: { checkinFloor: 6, fillFloor: 50, minAcceptScore: 50 },
  limits: {
    weeklyCap: 15,
    dailyHourCap: 4,
    barreMinShare: 0.25,
    earliestTime: "07:00",
    latestTime: "20:30",
    lunchStart: "13:00",
    lunchEnd: "15:00",
    sundayEarliest: "10:00",
  },
  ai: {
    weightCheckin: 0.4,
    weightFill: 0.3,
    weightTrend: 0.15,
    weightTier: 0.15,
    preferTier1: true,
    enforceAmPm: true,
    allowParallel: true,
    autoPinHigh: true,
    useAiPass: true,
    clusterTrainers: true,
    maxTrainersPerShift: 3,
    fillSparseHouses: true,
    noConsecutiveFormat: true,
    boutiqueSameShiftOnly: true,
    autoWeekOffs: true,
    weekOffsPerTrainer: 2,
    openaiKey: "",
    openaiModel: "gpt-4.1-mini",
    googleClientId: "",
    spreadsheetId: "16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys",
  },
};

// Saved day targets are kept as the user set them, with one correction: Saturday is the peak-load
// day, so its ceiling is lifted to at least the busiest weekday's ceiling. Without this, a settings
// blob saved before that rule existed capped Saturday below Monday and no repair pass could ever
// make Saturday the biggest day of the week.
function mergedTargets(saved: Settings["targets"] | undefined): Settings["targets"] {
  const out: Settings["targets"] = { ...DEFAULT_SETTINGS.targets, ...(saved ?? {}) };
  for (const locId of Object.keys(out)) {
    const days = { ...out[locId] };
    const weekdayMax = Math.max(...DAYS.filter((d) => d.key !== 5).map((d) => days[d.key]?.max ?? 0));
    const sat = days[5];
    if (sat && sat.max < weekdayMax) days[5] = { target: Math.max(sat.target, weekdayMax - 1), max: weekdayMax };
    // A day whose max equals its target leaves the per-day "wobble" nothing to work with, so that
    // day produces the exact same count on every single run regardless of seed. Every coverable day
    // (target > 0) gets at least one class of headroom above target so a run can actually land
    // somewhere different from the last one.
    for (const key of Object.keys(days)) {
      const d = days[Number(key)];
      if (d.target > 0 && d.max <= d.target) days[Number(key)] = { ...d, max: d.target + 1 };
    }
    out[locId] = days;
  }
  return out;
}

// Every path that brings in a Settings object from outside this build (localStorage, Supabase,
// an imported JSON file) must go through here. Settings saved before a field existed — Kwality's
// roomTypes map being the costly example — otherwise silently disable whole format families.
export function normalizeSettings(parsed: Settings | null | undefined): Settings {
  try {
    if (!parsed) return structuredClone(DEFAULT_SETTINGS);
    const mergedLocations = (parsed.locations?.length ? parsed.locations : DEFAULT_SETTINGS.locations).map((loc) => {
      const def = DEFAULT_SETTINGS.locations.find((l) => l.id === loc.id);
      if (!def) return loc;
      return {
        ...def,
        ...loc,
        rooms: loc.rooms?.length ? loc.rooms : def.rooms,
        roomTypes: { ...def.roomTypes, ...loc.roomTypes },
        roomCapacity: { ...def.roomCapacity, ...loc.roomCapacity },
        aliases: loc.aliases?.length ? loc.aliases : def.aliases,
      };
    });
    // Merge per-format band, keeping the higher of saved/default min so a stale saved band
    // (e.g. Kwality's Strength Lab min was raised from 2-4 to 8-12 in code) never permanently
    // shadows a later, larger default. Max follows the saved value when present.
    const mixedMix: Settings["mix"] = { ...DEFAULT_SETTINGS.mix };
    for (const locId of Object.keys(mixedMix)) {
      const savedLoc = parsed.mix?.[locId] ?? {};
      const merged = { ...mixedMix[locId] };
      for (const [name, savedBand] of Object.entries(savedLoc)) {
        const defBand = merged[name];
        merged[name] = defBand
          ? { min: Math.max(defBand.min, savedBand.min), max: Math.max(defBand.max, savedBand.max, savedBand.min) }
          : savedBand;
      }
      mixedMix[locId] = merged;
    }
    for (const locId of Object.keys(parsed.mix ?? {})) {
      if (!(locId in mixedMix)) mixedMix[locId] = parsed.mix![locId];
    }
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      targets: mergedTargets(parsed.targets),
      mix: mixedMix,
      ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
      // Raise a stale saved floor up to the current default rather than let an old, lower value
      // (e.g. the previous 22%/3.0 defaults) silently shadow a later increase in the required bar —
      // the same problem the Saturday-target migration above solves, applied to quality floors.
      quality: {
        ...DEFAULT_SETTINGS.quality,
        ...parsed.quality,
        fillFloor: Math.max(parsed.quality?.fillFloor ?? 0, DEFAULT_SETTINGS.quality.fillFloor),
        checkinFloor: Math.max(parsed.quality?.checkinFloor ?? 0, DEFAULT_SETTINGS.quality.checkinFloor),
      },
      // 15h/week across every location is an absolute ceiling, not a preference — clamp a saved
      // value down rather than let a stale or hand-edited settings blob raise it.
      limits: {
        ...DEFAULT_SETTINGS.limits,
        ...parsed.limits,
        weeklyCap: Math.min(parsed.limits?.weeklyCap ?? DEFAULT_SETTINGS.limits.weeklyCap, DEFAULT_SETTINGS.limits.weeklyCap),
      },
      trainers: parsed.trainers?.length ? parsed.trainers : structuredClone(TRAINERS),
      locations: mergedLocations,
      formats: parsed.formats?.length ? parsed.formats : structuredClone(FORMATS),
      bannedFormats: parsed.bannedFormats?.length ? parsed.bannedFormats : DEFAULT_SETTINGS.bannedFormats,
      floors: { ...DEFAULT_SETTINGS.floors, ...parsed.floors },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(raw) as Settings);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function locationOptions() {
  return LOCATIONS.map((l) => ({ id: l.id, label: `${l.name}, ${l.area}` }));
}
