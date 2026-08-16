export type Tag =
  | "mix"
  | "new"
  | "best"
  | "historic"
  | "evidence"
  | "constraint"
  | "experimental"
  | "protected"
  | "private"
  | "hosted"
  | "low"
  | "violation";

export type ViewId =
  | "grid"
  | "timeline"
  | "list"
  | "trainer"
  | "multi"
  | "city"
  | "heatmap"
  | "rooms"
  | "analytics"
  | "control"
  | "settings"
  | "report";

export type Location = {
  id: string;
  name: string;
  area: string;
  rooms: string[];
  accent: string;
  weeklyFloor: number;
  aliases?: string[];
  roomTypes?: Record<string, string>;
  roomCapacity?: Record<string, number>;
};

export type CertKey =
  | "barre"
  | "mat"
  | "cycle"
  | "strength"
  | "fit"
  | "cardio"
  | "amped"
  | "hiit"
  | "recovery"
  | "bbb";

export type Trainer = {
  id: string;
  name: string;
  photo: string;
  specialty: string;
  tier: 1 | 2 | 3 | 4;
  active: boolean;
  // Set when the week-off days were chosen by hand in Settings. While false, the generator picks
  // this trainer's two rest days itself, from where the week's load actually needs them.
  weekOffLocked?: boolean;
  certs: Record<CertKey, boolean>;
  access: Record<
    string,
    {
      days: number[];
      weekOff: number[];
      start: string;
      end: string;
      maxPerDay: number;
      avgCheckin: number;
    }
  >;
};

export type Format = {
  name: string;
  studio: string;
  duration: number;
  accent: string;
  cert: CertKey;
  family: "barre" | "mat" | "cycle" | "strength" | "fit" | "special";
  express?: boolean;
  fullName?: string;
};

export type ScoreBreakdown = {
  attendance: number;
  fill: number;
  proven: number;
  tier: number;
  combo: number;
};

export type MatchTier =
  | "exact"
  | "slot-format"
  | "nearby-exact"
  | "nearby-format"
  | "trainer-format"
  | "format-day"
  | "format-time"
  | "trainer-only"
  | "format-only"
  | "none";

export type Session = {
  id: string;
  locationId: string;
  day: number;
  time: string;
  name: string;
  studio: string;
  duration: number;
  trainerId: string;
  score: number;
  fill: number;
  avg: number;
  sessions: number;
  matchTier?: MatchTier;
  oneOff: boolean;
  kind?: "regular" | "private" | "hosted";
  reason: string;
  breakdown: ScoreBreakdown;
  capacity: number;
  tags: Tag[];
  accent: string;
  pinned?: boolean;
};

export type CustomRule = {
  id: string;
  ruleType: "trainer_availability" | "daily_target" | "weekly_class_mix" | "class_time_restriction" | "class_location_restriction";
  trainer?: string;
  location?: string;
  className?: string;
  day?: string;
  time?: string;
  operator: "exactly" | "max" | "min" | "only" | "never" | "at_least";
  value: number;
  priority: "hard" | "soft";
  enabled: boolean;
};

export type Pin = {
  id: string;
  locationId: string;
  day: number;
  time: string;
  className: string;
  trainerId: string;
  note: string;
  enabled: boolean;
  kind?: "regular" | "private" | "hosted";
  duration?: number;
  studio?: string;
  cert?: CertKey;
  family?: Format["family"];
};

export type DayTarget = { target: number; max: number };

export type MixBand = { min: number; max: number };

export type Settings = {
  targets: Record<string, Record<number, DayTarget>>;
  mix: Record<string, Record<string, MixBand>>;
  pins: Pin[];
  customRules: CustomRule[];
  inactiveTrainers: string[];
  leave: { trainerId: string; days: number[] }[];
  offDays: { trainerId: string; days: number[] }[];
  trainers: Trainer[];
  locations: Location[];
  formats: Format[];
  bannedFormats: string[];
  floors: Record<string, number>;
  quality: {
    checkinFloor: number;
    fillFloor: number;
    minAcceptScore: number;
  };
  limits: {
    weeklyCap: number;
    dailyHourCap: number;
    barreMinShare: number;
    earliestTime: string;
    latestTime: string;
    lunchStart: string;
    lunchEnd: string;
    sundayEarliest: string;
  };
  ai: {
    weightCheckin: number;
    weightFill: number;
    weightTrend: number;
    weightTier: number;
    preferTier1: boolean;
    enforceAmPm: boolean;
    allowParallel: boolean;
    autoPinHigh: boolean;
    useAiPass: boolean;
    clusterTrainers: boolean;
    maxTrainersPerShift: number;
    fillSparseHouses: boolean;
    noConsecutiveFormat: boolean;
    boutiqueSameShiftOnly: boolean;
    autoWeekOffs: boolean;
    weekOffsPerTrainer: number;
    openaiKey: string;
    openaiModel: string;
    googleClientId: string;
    spreadsheetId: string;
  };
};

export type HistoricOption = {
  name: string;
  trainerId: string;
  checkin: number;
  fill: number;
  sessions: number;
  score: number;
  oneOff: boolean;
  matchTier: MatchTier;
};

export type GenReport = {
  seed: number;
  hash: string;
  generatedAt: string;
  trials: number;
  pickedTrial: number;
  locations: Array<{
    id: string;
    count: number;
    floor: number;
    floorMet: boolean;
    avgScore: number;
    avgFill: number;
    avgCheckin: number;
    qualityMet: boolean;
    barreShare: number;
    violations: string[];
  }>;
  notes: string[];
  // Rest days actually granted this run, per trainer id — auto-assigned from load unless pinned.
  weekOffs?: Record<string, number[]>;
  // False when the source-sheet session history hadn't loaded yet at generation time, so every
  // placement was picked blind — the caller (App.tsx) uses this to detect a bootstrap schedule that
  // must be silently replaced once real data arrives, instead of just re-scoring the same blind picks.
  usedPerformanceData: boolean;
};
