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
  },
  {
    id: "kenkere",
    name: "Kenkere House",
    area: "Juhu",
    rooms: ["Studio 1", "Studio 2", "Studio 3"],
    accent: "#0e1729",
    weeklyFloor: 55,
    aliases: ["kenkere", "juhu"],
  },
  {
    id: "courtside",
    name: "Courtside",
    area: "Lower Parel",
    rooms: ["Studio 1"],
    accent: "#005eed",
    weeklyFloor: 6,
    aliases: ["courtside", "court", "lower parel"],
  },
  {
    id: "copper",
    name: "Copper & Cloves",
    area: "Colaba",
    rooms: ["Studio 1"],
    accent: "#005eed",
    weeklyFloor: 9,
    aliases: ["copper", "cloves", "colaba", "copper & cloves", "copper and cloves"],
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

export const FORMATS: Format[] = [
  { name: "Barre 57", studio: "Studio 2", duration: 50, accent: "#0e1729", cert: "barre", family: "barre" },
  { name: "Barre 57 Express", studio: "Studio 2", duration: 30, accent: "#0e1729", cert: "barre", family: "barre", express: true, fullName: "Barre 57" },
  { name: "Cardio Barre", studio: "Studio 3", duration: 50, accent: "#005eed", cert: "cardio", family: "barre" },
  { name: "Cardio Barre Plus", studio: "Studio 2", duration: 50, accent: "#0e1729", cert: "cardio", family: "barre" },
  { name: "Cardio Barre Express", studio: "Studio 3", duration: 30, accent: "#005eed", cert: "cardio", family: "barre", express: true, fullName: "Cardio Barre" },
  { name: "Mat 57", studio: "Studio 1", duration: 50, accent: "#005eed", cert: "mat", family: "mat" },
  { name: "Mat 57 Express", studio: "Studio 1", duration: 30, accent: "#005eed", cert: "mat", family: "mat", express: true, fullName: "Mat 57" },
  { name: "PowerCycle", studio: "PowerCycle Studio", duration: 45, accent: "#0e1729", cert: "cycle", family: "cycle" },
  { name: "PowerCycle Express", studio: "PowerCycle Studio", duration: 30, accent: "#0e1729", cert: "cycle", family: "cycle", express: true, fullName: "PowerCycle" },
  { name: "Strength Lab", studio: "Strength Lab", duration: 50, accent: "#005eed", cert: "strength", family: "strength" },
  { name: "FIT", studio: "Studio 1", duration: 50, accent: "#005eed", cert: "fit", family: "fit" },
  { name: "Amped Up!", studio: "Studio 1", duration: 45, accent: "#0e1729", cert: "amped", family: "special" },
  { name: "HIIT", studio: "Studio 3", duration: 45, accent: "#005eed", cert: "hiit", family: "special" },
  { name: "Back Body Blaze", studio: "Studio 1", duration: 50, accent: "#0e1729", cert: "bbb", family: "special" },
  { name: "Recovery", studio: "Studio 2", duration: 45, accent: "#005eed", cert: "recovery", family: "special" },
];

export const FORMAT_PRIORITY: Record<string, string[]> = {
  PowerCycle: ["vivaran", "cauveri", "karanvir"],
  "PowerCycle Express": ["vivaran", "cauveri", "karanvir"],
  "Strength Lab": ["atulan", "mrigakshi", "anisha", "reshma", "richard"],
  FIT: ["atulan", "mrigakshi", "anisha", "reshma", "richard"],
};

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

const KWALITY = `
0|07:15|Mat 57|anisha|85|20|0.0|mix,new
0|07:15|Cardio Barre Plus|pranjali|50|25|0.0|mix,new
0|07:30|Barre 57|atulan|53|43|7.4|historic,evidence
0|08:00|PowerCycle|karanvir|80|62|8.1|historic,evidence
0|09:15|Mat 57|cauveri|78|55|7.6|historic
0|10:30|FIT|reshma|72|48|6.9|mix
0|12:00|PowerCycle|rohan|88|71|8.4|historic,evidence,best
0|17:30|Barre 57|rohan|81|58|7.8|historic
0|18:15|Mat 57|anisha|84|64|7.2|historic,evidence
0|19:00|Cardio Barre|cauveri|76|52|6.8|mix
1|07:30|FIT|anisha|85|41|6.4|historic,evidence
1|07:30|PowerCycle Express|karanvir|50|48|4.8|historic
1|08:00|Mat 57|cauveri|82|60|7.5|historic,evidence
1|09:15|Strength Lab|mrigakshi|79|70|7.1|historic
1|10:30|Barre 57|pranjali|68|38|5.9|mix,low
1|12:00|Mat 57 Express|reshma|74|44|6.2|mix
1|17:30|Cardio Barre Plus|atulan|71|49|6.5|mix
1|18:15|PowerCycle|rohan|90|76|8.8|historic,evidence,best
1|19:00|Barre 57|cauveri|77|51|7.0|historic
2|07:30|Cardio Barre|atulan|85|39|7.7|historic,evidence
2|07:30|Strength Lab|anisha|85|100|7.0|historic,evidence,best
2|08:00|PowerCycle Express|karanvir|62|45|5.4|mix
2|09:15|Mat 57|cauveri|80|57|7.3|historic
2|10:30|FIT|reshma|73|42|6.4|mix,low
2|12:00|Barre 57|pranjali|69|36|5.8|mix,low
2|17:30|Mat 57|rohan|86|68|8.0|historic,evidence
2|18:15|PowerCycle|karanvir|84|72|8.2|historic,best
2|19:00|Cardio Barre Plus|mrigakshi|70|47|6.1|mix
3|07:15|Mat 57|anisha|83|33|5.5|mix,new
3|07:30|Barre 57|atulan|64|40|6.0|constraint
3|08:00|PowerCycle|rohan|87|69|8.3|historic,evidence
3|09:15|Strength Lab|simonelle|75|58|6.7|historic
3|10:30|Cardio Barre|cauveri|78|50|7.0|historic
3|12:00|FIT|reshma|71|43|6.3|mix
3|17:30|Mat 57|anisha|84|61|7.4|historic,evidence
3|18:15|Barre 57|pranjali|66|35|5.6|mix,low
3|18:15|PowerCycle Express|karanvir|79|64|7.2|historic
3|19:00|Cardio Barre Plus|mrigakshi|72|46|6.4|mix
4|07:15|Mat 57 Express|rohan|85|52|7.1|historic,evidence,best
4|07:30|Barre 57|atulan|60|38|5.8|constraint
4|08:00|Mat 57|cauveri|81|55|7.4|historic
4|08:00|Barre 57|pranjali|58|29|4.9|mix,low,new
4|09:15|Strength Lab|anisha|88|82|8.1|historic,evidence,best
4|10:30|FIT|reshma|74|47|6.6|mix
4|12:00|PowerCycle|karanvir|83|66|7.9|historic
4|17:30|Cardio Barre|cauveri|77|53|7.1|historic
4|18:15|Mat 57|rohan|89|74|8.5|historic,evidence,best
4|19:00|Barre 57|mrigakshi|70|41|6.2|mix
5|07:15|Mat 57|anisha|86|67|7.8|historic,evidence
5|07:30|Cardio Barre Plus|atulan|73|54|6.9|historic
5|08:00|PowerCycle|karanvir|91|88|8.9|historic,evidence,best
5|08:00|Barre 57|cauveri|80|63|7.5|historic
5|09:15|Strength Lab|simonelle|76|59|7.0|historic
5|10:30|FIT|reshma|78|61|7.2|historic,mix
5|12:00|Mat 57 Express|pranjali|69|48|6.0|mix
5|17:30|PowerCycle Express|rohan|84|70|8.0|historic,best
5|18:15|Cardio Barre|mrigakshi|72|50|6.5|mix
5|19:00|Barre 57|karan|55|22|4.2|low,new,constraint
6|07:15|Mat 57|cauveri|82|58|7.3|historic
6|07:30|Barre 57|atulan|67|44|6.1|mix
6|07:30|Strength Lab|anisha|90|92|8.6|historic,evidence,best
6|08:00|PowerCycle|karanvir|88|80|8.4|historic,evidence
6|08:00|FIT|reshma|75|49|6.7|mix
6|09:15|Mat 57|rohan|85|65|7.9|historic,evidence
6|10:30|Cardio Barre Plus|pranjali|63|31|5.4|low,new
6|12:00|PowerCycle Express|raunak|70|42|5.9|mix
6|17:30|Barre 57|mrigakshi|74|47|6.6|mix
6|18:15|Mat 57|vivaran|48|18|3.1|low,new,violation
6|19:00|Cardio Barre|anmol|61|27|4.8|low,new
`.trim();

function enrich(s: Omit<Session, "sessions" | "oneOff" | "reason" | "breakdown" | "capacity">): Session {
  const sessions = 8 + (Number(s.score) % 20);
  return {
    ...s,
    sessions,
    oneOff: sessions < 4,
    reason: `Historic ${s.name} with ${s.avg} avg check-ins and ${s.fill}% fill.`,
    breakdown: { attendance: Math.min(55, (s.avg / 10) * 55), fill: (s.fill / 100) * 30, proven: 8, tier: 3, combo: 2 },
    capacity: 18,
  };
}

function parseBlock(locationId: string, raw: string): Session[] {
  return raw.split("\n").flatMap((line) => {
    const [d, t, cls, tr, score, fill, avg, tags] = line.split("|");
    const format = FORMATS.find((f) => f.name === cls);
    if (!format) return [];
    return [enrich({
      id: `${locationId}-${d}-${t}-${cls.replace(/\s+/g, "-").toLowerCase()}`,
      locationId,
      day: Number(d),
      time: t,
      name: cls,
      studio: format.studio,
      duration: format.duration,
      trainerId: tr,
      score: Number(score),
      fill: Number(fill),
      avg: Number(avg),
      tags: (tags ? tags.split(",") : []) as Tag[],
      accent: format.accent,
    })];
  });
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fabricate(locationId: string, count: number, fillBoost: number, rotate: number): Session[] {
  const slots: Array<[number, string, string]> = [
    [0, "07:15", "Mat 57"],
    [0, "07:30", "Barre 57"],
    [0, "08:00", "PowerCycle"],
    [0, "09:15", "Strength Lab"],
    [0, "12:00", "FIT"],
    [0, "17:30", "Cardio Barre"],
    [0, "18:15", "Mat 57"],
    [0, "19:00", "PowerCycle Express"],
    [1, "07:30", "Cardio Barre Plus"],
    [1, "08:00", "Mat 57"],
    [1, "09:15", "Barre 57"],
    [1, "17:30", "PowerCycle"],
    [1, "18:15", "Strength Lab"],
    [1, "19:00", "FIT"],
    [2, "07:15", "Mat 57 Express"],
    [2, "07:30", "Barre 57"],
    [2, "08:00", "PowerCycle"],
    [2, "10:30", "Cardio Barre"],
    [2, "17:30", "Mat 57"],
    [2, "18:15", "Barre 57"],
    [3, "07:30", "Strength Lab"],
    [3, "08:00", "PowerCycle Express"],
    [3, "09:15", "FIT"],
    [3, "17:30", "Cardio Barre Plus"],
    [3, "18:15", "Mat 57"],
    [3, "19:00", "Barre 57"],
    [4, "07:15", "Mat 57"],
    [4, "07:30", "Barre 57"],
    [4, "08:00", "PowerCycle"],
    [4, "09:15", "Strength Lab"],
    [4, "12:00", "Cardio Barre"],
    [4, "17:30", "FIT"],
    [4, "18:15", "Mat 57"],
    [4, "19:00", "PowerCycle Express"],
    [5, "07:15", "Barre 57"],
    [5, "08:00", "PowerCycle"],
    [5, "09:15", "Mat 57"],
    [5, "10:30", "Strength Lab"],
    [5, "17:30", "Cardio Barre Plus"],
    [5, "18:15", "FIT"],
    [6, "07:30", "Mat 57"],
    [6, "08:00", "PowerCycle"],
    [6, "09:15", "Barre 57"],
    [6, "12:00", "Strength Lab"],
    [6, "17:30", "Cardio Barre"],
    [6, "18:15", "Mat 57 Express"],
    [6, "19:00", "PowerCycle Express"],
  ];

  return slots.slice(0, count).map(([day, time, name], i) => {
    const format = FORMATS.find((f) => f.name === name)!;
    const trainer = TRAINERS[(i + rotate) % TRAINERS.length];
    const n = hash(`${locationId}-${day}-${time}-${name}`);
    const fill = Math.min(98, Math.max(16, 38 + fillBoost + (n % 48)));
    const score = Math.min(96, Math.max(46, 58 + (n % 38)));
    const tags: Tag[] = [];
    if (score >= 78) tags.push("historic");
    if (score >= 84) tags.push("evidence");
    if (fill < 35) tags.push("low");
    if (n % 7 === 0) tags.push("mix");
    if (n % 11 === 0) tags.push("new");
    if (n % 17 === 0) tags.push("best");
    if (locationId === "supreme" && i === 3) tags.push("constraint");
    if (locationId === "courtside" && i === 8) tags.push("experimental");
    return enrich({
      id: `${locationId}-${day}-${time}-${name.replace(/\s+/g, "-").toLowerCase()}`,
      locationId,
      day,
      time,
      name,
      studio: format.studio,
      duration: format.duration,
      trainerId: trainer.id,
      score,
      fill,
      avg: Number((4 + (n % 50) / 10).toFixed(1)),
      tags,
      accent: format.accent,
    });
  });
}

export const SESSIONS: Session[] = [
  ...parseBlock("kwality", KWALITY),
  ...fabricate("supreme", 74, 12, 2),
  ...fabricate("courtside", 58, 4, 5),
  ...fabricate("kenkere", 52, 18, 1),
  ...fabricate("copper", 41, -4, 7),
];

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
