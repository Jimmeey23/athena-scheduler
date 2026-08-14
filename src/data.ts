import type { CertKey, Format, Location, Session, Tag, Trainer } from "./types";

const REPO = "https://raw.githubusercontent.com/Jimmeey23/make-my-schedule/codex/dynamic-schedule-counts/web/images";
const photo = (file: string) => `${REPO}/${encodeURIComponent(file)}`;

export const DAYS = [
  { key: 0, label: "Mon", date: "10 Aug", full: "Monday" },
  { key: 1, label: "Tue", date: "11 Aug", full: "Tuesday" },
  { key: 2, label: "Wed", date: "12 Aug", full: "Wednesday" },
  { key: 3, label: "Thu", date: "13 Aug", full: "Thursday" },
  { key: 4, label: "Fri", date: "14 Aug", full: "Friday", today: true },
  { key: 5, label: "Sat", date: "15 Aug", full: "Saturday" },
  { key: 6, label: "Sun", date: "16 Aug", full: "Sunday" },
];

export const TIMES = [
  "07:15",
  "07:30",
  "08:00",
  "08:15",
  "08:30",
  "08:45",
  "09:00",
  "09:15",
  "09:30",
  "10:15",
  "11:00",
  "11:15",
  "11:30",
  "11:45",
  "12:00",
  "17:15",
  "17:30",
  "17:45",
  "18:00",
  "18:15",
  "18:30",
  "18:45",
  "19:00",
  "19:15",
];

export const LOCATIONS: Location[] = [
  {
    id: "kwality",
    name: "Kwality House",
    area: "Kemp's Corner",
    rooms: ["Studio 1", "Studio 2", "PowerCycle Studio", "Strength Lab"],
    accent: "#005eed",
    weeklyFloor: 70,
    aliases: ["kwality", "kemp", "kemp's corner", "kempscorner"],
    roomTypes: { cycle: "PowerCycle Studio", strength: "Strength Lab" },
    roomCapacity: { "Studio 1": 22, "Studio 2": 13, "Strength Lab": 7, "PowerCycle Studio": 10 },
  },
  {
    id: "supreme",
    name: "Supreme HQ",
    area: "Bandra West",
    rooms: ["Studio 1", "Studio 2", "PowerCycle Studio"],
    accent: "#0e1729",
    weeklyFloor: 65,
    aliases: ["supreme", "bandra", "bandra west", "hq"],
    roomTypes: { cycle: "PowerCycle Studio" },
    roomCapacity: { "Studio 1": 13, "Studio 2": 13, "PowerCycle Studio": 10 },
  },
  {
    id: "kenkere",
    name: "Kenkere House",
    area: "Juhu",
    rooms: ["Studio 1", "Studio 2", "Studio 3"],
    accent: "#0e1729",
    weeklyFloor: 55,
    aliases: ["kenkere", "juhu"],
    roomCapacity: { "Studio 1": 13, "Studio 2": 13, "Studio 3": 13 },
  },
  {
    id: "courtside",
    name: "Courtside",
    area: "Lower Parel",
    rooms: ["Studio 1"],
    accent: "#005eed",
    weeklyFloor: 6,
    aliases: ["courtside", "court", "lower parel"],
    roomCapacity: { "Studio 1": 13 },
  },
  {
    id: "copper",
    name: "Copper & Cloves",
    area: "Colaba",
    rooms: ["Studio 1"],
    accent: "#005eed",
    weeklyFloor: 9,
    aliases: ["copper", "cloves", "colaba", "copper & cloves", "copper and cloves"],
    roomCapacity: { "Studio 1": 13 },
  },
];

// Single source of truth for free-text -> location id resolution (chatbot, imports, sheet rows).
export function resolveLocationId(text: string, locations: Location[] = LOCATIONS): string | null {
  const n = text.toLowerCase();
  for (const loc of locations) {
    if (n.includes(loc.id)) return loc.id;
    if (loc.aliases?.some((a) => n.includes(a))) return loc.id;
    if (n.includes(loc.name.toLowerCase())) return loc.id;
  }
  return null;
}

const none: Record<CertKey, boolean> = {
  barre: false,
  mat: false,
  cycle: false,
  strength: false,
  fit: false,
  cardio: false,
  amped: false,
  hiit: false,
  recovery: false,
  bbb: false,
};

const certs = (keys: CertKey[]): Record<CertKey, boolean> => {
  const c = { ...none };
  keys.forEach((k) => {
    c[k] = true;
  });
  return c;
};

const loc = (days: number[], weekOff: number[], maxPerDay: number, avgCheckin: number) => ({
  days,
  weekOff,
  start: "07:00",
  end: "21:00",
  maxPerDay,
  avgCheckin,
});

export const TRAINERS: Trainer[] = [
  { id: "anisha", name: "Anisha Shah", photo: photo("001-1_Anisha-1-e1590837044475.jpg"), specialty: "Mat · Strength", tier: 1, active: true, certs: certs(["barre", "mat", "cycle", "strength", "fit", "cardio", "amped"]), access: { kwality: loc([0, 1, 2], [5, 6], 4, 7.7), supreme: loc([3, 4], [5, 6], 4, 6.1) } },
  { id: "atulan", name: "Atulan Purohit", photo: photo("002-Atulan-Image-1.jpg"), specialty: "Strength · Barre", tier: 1, active: true, certs: certs(["barre", "mat", "strength", "fit", "cardio", "amped"]), access: { kwality: loc([0, 2, 3, 4, 5], [6, 1], 4, 5.9), supreme: loc([0, 2, 3, 4, 5], [6, 1], 4, 5.2) } },
  { id: "cauveri", name: "Cauveri Vikrant", photo: photo("003-Cauveri-1.jpg"), specialty: "Barre · Cycle", tier: 1, active: true, certs: certs(["barre", "mat", "cycle", "cardio"]), access: { kwality: loc([1, 2, 4, 5, 6], [0, 3], 3, 5.7), supreme: loc([1, 5], [0, 3], 3, 5.4) } },
  { id: "kajol", name: "Kajol Kanchan", photo: photo("004-Kajol-Kanchan-1.jpg"), specialty: "Barre · Mat", tier: 1, active: true, certs: certs(["barre", "mat", "cardio", "fit"]), access: { kenkere: loc([0, 1, 3, 4, 5, 6], [2], 4, 5.2), courtside: loc([0, 2, 4], [6], 2, 4.6) } },
  { id: "karan", name: "Karan Bhatia", photo: photo("005-Karan-Bhatia-1-1.jpeg"), specialty: "Barre", tier: 2, active: true, certs: certs(["barre", "cardio"]), access: { kwality: loc([5], [0, 1, 2], 2, 3.4), kenkere: loc([1, 4, 6], [0], 2, 3.6) } },
  { id: "mrigakshi", name: "Mrigakshi Jaiswal", photo: photo("007-Mrigakshi-Image-2.jpg"), specialty: "FIT · Cardio", tier: 1, active: true, certs: certs(["barre", "mat", "fit", "cardio", "strength"]), access: { kwality: loc([1, 2, 3, 4, 5, 6], [0], 4, 6.6), supreme: loc([1, 4], [0], 3, 5.9) } },
  { id: "pranjali", name: "Pranjali Jain", photo: photo("008-Pranjali-Image-1.jpg"), specialty: "Barre", tier: 1, active: true, certs: certs(["barre", "mat", "cardio", "amped", "strength"]), access: { kwality: loc([0, 1, 2, 4, 5], [3, 6], 3, 5.4), kenkere: loc([0, 2, 5], [3, 6], 3, 5.1) } },
  { id: "pushyank", name: "Pushyank Nahar", photo: photo("009-Pushyank-Nahar-1.jpeg"), specialty: "Barre", tier: 1, active: true, certs: certs(["barre", "mat", "cardio"]), access: { kenkere: loc([0, 1, 2, 3, 4, 5], [6], 4, 5.3), copper: loc([5, 6], [2], 2, 4.8) } },
  { id: "reshma", name: "Reshma Sharma", photo: photo("010-Reshma-Image-3.jpg"), specialty: "FIT · Conditioning", tier: 1, active: true, certs: certs(["barre", "mat", "fit", "cardio", "strength"]), access: { kwality: loc([0, 1, 2, 4, 5], [3, 6], 4, 6.4), supreme: loc([0, 5], [3, 6], 3, 5.8) } },
  { id: "richard", name: "Richard D'Costa", photo: photo("011-Richard-Image-3.jpg"), specialty: "FIT · Strength", tier: 1, active: true, certs: certs(["fit", "strength", "barre", "mat", "cardio"]), access: { kwality: loc([1, 3, 4], [5, 6], 3, 5.6), supreme: loc([1, 3, 4], [5, 6], 3, 6.0) } },
  { id: "rohan", name: "Rohan Dahima", photo: photo("012-Rohan-Image-3.jpg"), specialty: "Cycle · Barre", tier: 1, active: true, certs: certs(["barre", "mat", "cycle", "fit", "cardio", "hiit"]), access: { kwality: loc([0, 1, 2, 3, 4, 5, 6], [1], 4, 6.8), supreme: loc([0, 2, 4, 5], [1], 3, 6.2) } },
  { id: "saniya", name: "Saniya Dastoor", photo: photo("013-Saniya-Image-1.jpg"), specialty: "Barre · Mat", tier: 2, active: true, certs: certs(["barre", "mat", "cardio"]), access: { kenkere: loc([0, 2, 4, 5], [1, 6], 3, 4.9), copper: loc([5, 6], [3], 2, 4.6) } },
  { id: "shruti", name: "Shruti Kulkarni", photo: photo("014-Shruti-Kulkarni.jpeg"), specialty: "Mat · FIT", tier: 1, active: true, certs: certs(["barre", "mat", "fit"]), access: { kenkere: loc([0, 2, 3, 5, 6], [1, 4], 3, 5.0), copper: loc([0, 3, 6], [1], 2, 4.7) } },
  { id: "vivaran", name: "Vivaran Dhasmana", photo: photo("015-Vivaran-Image-4.jpg"), specialty: "PowerCycle", tier: 1, active: true, certs: certs(["cycle", "mat", "barre"]), access: { kwality: loc([0, 2, 4, 5], [1, 6], 3, 5.5), supreme: loc([0, 2, 4, 5], [1, 6], 3, 5.8) } },
  { id: "karanvir", name: "Karanvir Bhatia", photo: photo("Karanvir.jpg"), specialty: "PowerCycle", tier: 1, active: true, certs: certs(["barre", "mat", "cycle", "cardio"]), access: { kwality: loc([0, 1, 2, 3, 5, 6], [4], 4, 6.0), supreme: loc([0, 1, 3, 5], [4], 3, 6.3) } },
  { id: "anmol", name: "Anmol Sharma", photo: photo("Anmol.jpeg"), specialty: "PowerCycle", tier: 2, active: true, certs: certs(["cycle", "barre", "cardio", "mat"]), access: { kwality: loc([0, 2, 3, 5, 6], [1, 4], 2, 3.0), supreme: loc([0, 2, 3, 5, 6], [1, 4], 2, 2.9) } },
  { id: "bret", name: "Bret Saldanha", photo: photo("Bret.jpeg"), specialty: "PowerCycle", tier: 2, active: true, certs: certs(["cycle", "barre"]), access: { kwality: loc([0, 1, 4, 5, 6], [2, 3], 2, 3.2), supreme: loc([0, 1, 5], [2, 3], 2, 3.0) } },
  { id: "simonelle", name: "Simonelle De Vitre", photo: photo("Simonelle.jpeg"), specialty: "Cycle · Mat", tier: 2, active: true, certs: certs(["cycle", "mat", "barre"]), access: { kwality: loc([3, 6], [0, 1], 2, 5.1), supreme: loc([3], [0, 1], 2, 4.9) } },
  { id: "raunak", name: "Raunak Khemuka", photo: photo("Raunak.jpeg"), specialty: "Cycle", tier: 3, active: true, certs: certs(["cycle"]), access: { kwality: loc([6], [1, 2], 1, 3.1), supreme: loc([6], [1, 2], 1, 3.0) } },
  { id: "simran", name: "Simran Kapoor", photo: photo("Simran.jpeg"), specialty: "Barre", tier: 2, active: true, certs: certs(["barre", "mat", "fit"]), access: { kenkere: loc([1, 3, 5], [0, 6], 3, 4.8), courtside: loc([2, 4], [6], 2, 4.4) } },
  { id: "veena", name: "Veena Nair", photo: photo("Veena.jpeg"), specialty: "Mat · Recovery", tier: 2, active: true, certs: certs(["mat", "recovery", "barre"]), access: { copper: loc([0, 2, 4, 6], [1], 2, 4.5), kenkere: loc([5, 6], [2], 2, 4.3) } },
];

// Durations drive room/trainer overlap checks — must match reality exactly. Only Strength Lab,
// PowerCycle Express, and Recovery run 30 minutes; every other Express class runs 45; everything else 60.
export const FORMATS: Format[] = [
  { name: "Barre 57", studio: "Studio 2", duration: 60, accent: "#0e1729", cert: "barre", family: "barre" },
  { name: "Barre 57 Express", studio: "Studio 2", duration: 45, accent: "#0e1729", cert: "barre", family: "barre", express: true, fullName: "Barre 57" },
  { name: "Cardio Barre", studio: "Studio 3", duration: 60, accent: "#005eed", cert: "cardio", family: "barre" },
  { name: "Cardio Barre Plus", studio: "Studio 2", duration: 60, accent: "#0e1729", cert: "cardio", family: "barre" },
  { name: "Cardio Barre Express", studio: "Studio 3", duration: 45, accent: "#005eed", cert: "cardio", family: "barre", express: true, fullName: "Cardio Barre" },
  { name: "Mat 57", studio: "Studio 1", duration: 60, accent: "#005eed", cert: "mat", family: "mat" },
  { name: "Mat 57 Express", studio: "Studio 1", duration: 45, accent: "#005eed", cert: "mat", family: "mat", express: true, fullName: "Mat 57" },
  { name: "PowerCycle", studio: "PowerCycle Studio", duration: 60, accent: "#0e1729", cert: "cycle", family: "cycle" },
  { name: "PowerCycle Express", studio: "PowerCycle Studio", duration: 30, accent: "#0e1729", cert: "cycle", family: "cycle", express: true, fullName: "PowerCycle" },
  { name: "Strength Lab", studio: "Strength Lab", duration: 30, accent: "#005eed", cert: "strength", family: "strength" },
  { name: "FIT", studio: "Studio 1", duration: 60, accent: "#005eed", cert: "fit", family: "fit" },
  { name: "Amped Up!", studio: "Studio 1", duration: 60, accent: "#0e1729", cert: "amped", family: "special" },
  { name: "HIIT", studio: "Studio 3", duration: 60, accent: "#005eed", cert: "hiit", family: "special" },
  { name: "Back Body Blaze", studio: "Studio 1", duration: 60, accent: "#0e1729", cert: "bbb", family: "special" },
  { name: "Recovery", studio: "Studio 2", duration: 30, accent: "#005eed", cert: "recovery", family: "special" },
];

export const FORMAT_PRIORITY: Record<string, string[]> = {
  PowerCycle: ["vivaran", "cauveri", "karanvir"],
  "PowerCycle Express": ["vivaran", "cauveri", "karanvir"],
  "Strength Lab": ["atulan", "mrigakshi", "anisha", "reshma", "richard"],
  FIT: ["atulan", "mrigakshi", "anisha", "reshma", "richard"],
};

export type ClassLevel = "Beginner" | "Intermediate" | "Advanced";

const BEGINNER_FORMATS = new Set(["Barre 57", "Barre 57 Express", "PowerCycle", "PowerCycle Express", "Recovery"]);
const ADVANCED_FORMATS = new Set(["HIIT", "Amped Up!", "Trainers Choice", "Strength Lab"]);

export function levelOf(formatName: string): ClassLevel {
  if (BEGINNER_FORMATS.has(formatName)) return "Beginner";
  if (ADVANCED_FORMATS.has(formatName)) return "Advanced";
  return "Intermediate";
}

export const TIER1_PRIORITY = ["anisha", "rohan", "reshma", "atulan", "pranjali", "karanvir", "mrigakshi", "vivaran", "pushyank", "kajol", "shruti"];

export const TAG_META: Record<Tag, { label: string; cls: string }> = {
  mix: { label: "Mix balance", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  new: { label: "New data", cls: "bg-violet-50 text-violet-800 ring-violet-200" },
  best: { label: "Best trainer", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  historic: { label: "Strong historic", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  evidence: { label: "High evidence", cls: "bg-lime-50 text-lime-800 ring-lime-200" },
  constraint: { label: "Trainer constraint", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
  experimental: { label: "Experimental", cls: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200" },
  protected: { label: "Protected slot", cls: "bg-teal-50 text-teal-800 ring-teal-200" },
  low: { label: "Low fill watch", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
  violation: { label: "Hard flag", cls: "bg-red-50 text-red-700 ring-red-200" },
};

export function trainerById(id: string) {
  return (
    TRAINERS.find((t) => t.id === id) || {
      id,
      name: id,
      photo: "",
      specialty: "",
      tier: 3 as const,
      active: true,
      certs: {
        barre: false,
        mat: false,
        cycle: false,
        strength: false,
        fit: false,
        cardio: false,
        amped: false,
        hiit: false,
        recovery: false,
        bbb: false,
      },
      access: {},
    }
  );
}

export function locationById(id: string) {
  return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
}

export function applySchedule(
  sessions: Session[],
  opts: { pinned: string[]; reassigned: Record<string, string>; optimized: boolean }
) {
  return sessions.map((s) => {
    const next = { ...s, tags: [...s.tags] };
    if (opts.reassigned[s.id]) next.trainerId = opts.reassigned[s.id];
    if (opts.optimized) {
      if (next.fill < 40) next.fill = Math.min(68, next.fill + 18);
      if (next.score < 60) next.score = Math.min(78, next.score + 12);
      next.tags = next.tags.filter((t) => t !== "violation" && t !== "low");
      if (next.fill >= 70 && !next.tags.includes("historic")) next.tags.push("historic");
    }
    return next;
  });
}

export function kpisFor(sessions: Session[], pinned: string[]) {
  const n = sessions.length || 1;
  const strong = sessions.filter((s) => s.tags.includes("historic")).length;
  const mix = sessions.filter((s) => s.tags.includes("mix")).length;
  const protectedSlot = sessions.filter((s) => s.tags.includes("protected")).length;
  const experimental = sessions.filter((s) => s.tags.includes("experimental")).length;
  const constraints = sessions.filter((s) => s.tags.includes("constraint")).length;
  const violations = sessions.filter((s) => s.tags.includes("violation")).length;
  const avgFill = sessions.reduce((a, s) => a + s.fill, 0) / n;
  return [
    { key: "gen", label: "Generated", value: String(sessions.length), hint: "classes this week", tone: "ivory" },
    { key: "pin", label: "Pinned", value: String(pinned.filter((id) => sessions.some((s) => s.id === id)).length), hint: "locked by you", tone: "ivory" },
    { key: "fill", label: "Avg fill", value: `${avgFill.toFixed(1)}%`, hint: "projected occupancy", tone: avgFill >= 50 ? "good" : "warn" },
    { key: "hist", label: "Strong historic", value: `${strong}`, hint: `${Math.round((strong / n) * 100)}% of mix`, tone: "good" },
    { key: "mix", label: "Variety & mix", value: `${mix}`, hint: `${Math.round((mix / n) * 100)}% balanced`, tone: "ivory" },
    { key: "prot", label: "Protected", value: `${protectedSlot}`, hint: `${((protectedSlot / n) * 100).toFixed(0)}%`, tone: "ivory" },
    { key: "exp", label: "Experimental", value: `${experimental}`, hint: `${((experimental / n) * 100).toFixed(1)}%`, tone: experimental ? "warn" : "ivory" },
    { key: "con", label: "Constraints", value: `${constraints}`, hint: `${((constraints / n) * 100).toFixed(0)}% of slots`, tone: constraints ? "warn" : "ivory" },
    { key: "vio", label: "Violations", value: `${violations}`, hint: violations ? "needs review" : "clear", tone: violations ? "bad" : "good" },
  ] as const;
}

export function trainerLoad(sessions: Session[]) {
  const map = new Map<string, { hours: number; classes: number }>();
  for (const t of TRAINERS) map.set(t.id, { hours: 0, classes: 0 });
  for (const s of sessions) {
    const row = map.get(s.trainerId);
    if (!row) continue;
    row.classes += 1;
    row.hours += s.duration / 60;
  }
  return TRAINERS.map((t) => ({
    ...t,
    hours: Number((map.get(t.id)?.hours ?? 0).toFixed(1)),
    classes: map.get(t.id)?.classes ?? 0,
  }))
    .filter((t) => t.classes > 0)
    .sort((a, b) => b.hours - a.hours);
}

export function tickerItems(sessions: Session[], locationName: string) {
  const k = kpisFor(sessions, []);
  const dominant = [...sessions.reduce((m, s) => m.set(s.name, (m.get(s.name) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])[0];
  return [
    { label: "Trainer constraints", value: k[7].value, tone: "warn" },
    { label: "Prime coverage", value: `${sessions.filter((s) => ["07:15", "07:30", "18:15", "19:00"].includes(s.time)).length} slots`, tone: "good" },
    { label: "Trainers", value: String(new Set(sessions.map((s) => s.trainerId)).size), tone: "ivory" },
    { label: "Low fill watch", value: String(sessions.filter((s) => s.tags.includes("low")).length), tone: "warn" },
    { label: "New data", value: String(sessions.filter((s) => s.tags.includes("new")).length), tone: "ivory" },
    { label: "Hard flags", value: String(sessions.filter((s) => s.tags.includes("violation")).length), tone: "bad" },
    { label: "Dominant class", value: dominant ? `${dominant[0]} · ${dominant[1]}` : "—", tone: "ivory" },
    { label: "Scope", value: locationName, tone: "gold" },
    { label: "Classes", value: String(sessions.length), tone: "ivory" },
    { label: "Projected fill", value: k[2].value, tone: "gold" },
    { label: "Strong evidence", value: String(sessions.filter((s) => s.tags.includes("evidence")).length), tone: "good" },
  ];
}
