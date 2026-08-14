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
      [8, 11],
      [6, 7],
    ]),
    courtside: dayTargets([
      [1, 1],
      [1, 1],
      [1, 1],
      [0, 1],
      [1, 1],
      [1, 1],
      [1, 1],
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
      "Strength Lab": { min: 2, max: 4 },
      FIT: { min: 12, max: 15 },
      "Amped Up!": { min: 1, max: 2 },
      HIIT: { min: 1, max: 2 },
      "Back Body Blaze": { min: 0, max: 2 },
      Recovery: { min: 0, max: 2 },
    },
    supreme: {
      "Barre 57": { min: 16, max: 20 },
      "Cardio Barre": { min: 8, max: 11 },
      "Mat 57": { min: 7, max: 10 },
      PowerCycle: { min: 12, max: 16 },
      FIT: { min: 10, max: 14 },
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
  quality: { checkinFloor: 3.0, fillFloor: 22, minAcceptScore: 50 },
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
    openaiKey: "",
    openaiModel: "gpt-4.1-mini",
    googleClientId: "",
    spreadsheetId: "16wFlke0bHFcmfn-3UyuYlGnImBq0DY7ouVYAlAFTZys",
  },
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Settings;
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      targets: { ...DEFAULT_SETTINGS.targets, ...parsed.targets },
      mix: { ...DEFAULT_SETTINGS.mix, ...parsed.mix },
      ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
      quality: { ...DEFAULT_SETTINGS.quality, ...parsed.quality },
      limits: { ...DEFAULT_SETTINGS.limits, ...parsed.limits },
      trainers: parsed.trainers?.length ? parsed.trainers : structuredClone(TRAINERS),
      locations: parsed.locations?.length ? parsed.locations : structuredClone(LOCATIONS),
      formats: parsed.formats?.length ? parsed.formats : structuredClone(FORMATS),
      bannedFormats: parsed.bannedFormats?.length ? parsed.bannedFormats : DEFAULT_SETTINGS.bannedFormats,
      floors: { ...DEFAULT_SETTINGS.floors, ...parsed.floors },
    };
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
