import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  DoorOpen,
  FileText,
  Flame,
  GanttChart,
  LayoutGrid,
  List,
  Map,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
  Wand2,
  X,
} from "lucide-react";
import {
  DAYS,
  LOCATIONS,
  TRAINERS,
  applySchedule,
  kpisFor,
  levelOf,
  locationById,
  tickerItems,
  trainerById,
  trainerLoad,
} from "./data";
import type { Pin, Session, Settings, ViewId } from "./types";
import { Dropdown, MultiSelect, topTrainersFor } from "./ui";
import { complianceFor, generateSchedule, hasConflict, historicFor, refreshSessionMetrics, scoreCombo, slotHistory } from "./engine";
import { FORMATS } from "./data";
import { loadSettings, saveSettings } from "./settings";
import { loadCurrentSchedule, loadDrafts, pushDraft, saveCurrentSchedule } from "./drafts";
import { ENV } from "./env";
import { SettingsView } from "./SettingsView";
import { ClassModal } from "./ClassModal";
import { CreateClassModal } from "./CreateClassModal";
import { Chatbot } from "./Chatbot";
import { hasPerformance, loadSnapshotCsv, setPerformanceRows } from "./performance";
import { loadCloud, persistCloud, persistSchedule, loadSchedule, finalizeSchedule } from "./supabase";
import { recordOverride } from "./overrides";
import { exportCSV, exportHTML, exportJSON, exportPDF, exportPNG } from "./export";import {
  AnalyticsView,
  CityView,
  ControlView,
  GridView,
  HeatmapView,
  ListView,
  MultiView,
  ReportView,
  RoomsView,
  TimelineView,
  TrainerView,
} from "./views";

const VIEWS: { id: ViewId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "list", label: "List", icon: List },
  { id: "trainer", label: "Trainers", icon: Users },
  { id: "multi", label: "Multi-location", icon: Building2 },
  { id: "city", label: "Intra-city", icon: Map },
  { id: "heatmap", label: "Heatmap", icon: Flame },
  { id: "rooms", label: "Rooms", icon: DoorOpen },
  { id: "analytics", label: "Analytics", icon: Activity },
  { id: "control", label: "Control", icon: ShieldAlert },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
  { id: "report", label: "Report", icon: FileText },
];

const AI_STEPS = [
  "Loading historic attendance and fill by class × trainer × slot…",
  "Dropping Hosted, Foundations, and SWEAT In 30 from the candidate pool…",
  "Applying saved pins, leave, certs, and inactive trainers…",
  "Drafting Kwality House against weekly floor and mix bands…",
  "Drafting Supreme HQ with PowerCycle priority trainers…",
  "Drafting Kenkere / Courtside / Copper without banned formats…",
  "Running 5 independent trials and scoring attendance, fill, and trend…",
  "Rejecting one-off combos that outrank scheduled history…",
  "Checking AM/PM split, 4h/day, 15h/week, one house per shift…",
  "Applying learned corrections from your past manual swaps…",
  "Hill-climbing: reassigning the weakest-scoring slots to stronger trainers…",
  "Keeping the highest-accuracy unique draft…",
];

function mondayOf(d: Date) {
  const n = new Date(d);
  const day = n.getDay();
  const diff = (day + 6) % 7; // days since Monday
  n.setDate(n.getDate() - diff);
  n.setHours(0, 0, 0, 0);
  return n;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtShort(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function App() {
  const [locationId, setLocationId] = useState("kwality");
  const [view, setView] = useState<ViewId>("grid");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusTrainer, setFocusTrainer] = useState<string | null>(null);
  const [reassigned, setReassigned] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bundle, setBundle] = useState(() => {
    const saved = loadCurrentSchedule();
    if (saved) return saved;
    try {
      // First-ever load with no saved schedule: generate once with a fixed seed and persist it.
      const first = generateSchedule(loadSettings(), 20260810, false);
      saveCurrentSchedule(first);
      return first;
    } catch {
      return { sessions: [] as Session[], report: { seed: 0, hash: "boot", generatedAt: new Date().toISOString(), trials: 0, pickedTrial: 0, locations: [], notes: ["Booted without a draft"] } };
    }
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [railOpen, setRailOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [kpiKey, setKpiKey] = useState<string | null>(null);
  const [perfCount, setPerfCount] = useState(0);
  const [genLocationIds, setGenLocationIds] = useState<string[]>(LOCATIONS.map((l) => l.id));
  const [genSummary, setGenSummary] = useState<null | {
    total: number;
    ai: number;
    pinned: number;
    variety: number;
    byFormat: Array<[string, number]>;
    byTrainer: Array<[string, number]>;
  }>(null);

  useEffect(() => {
    // Loads historic performance data only — must not silently reshuffle the displayed schedule.
    loadSnapshotCsv()
      .then((rows) => {
        setPerformanceRows(rows);
        setPerfCount(rows.length);
        setBundle((b) => {
          const refreshed = { ...b, sessions: refreshSessionMetrics(b.sessions, settings) };
          saveCurrentSchedule(refreshed);
          return refreshed;
        });
      })
      .catch(() => setPerfCount(0));
  }, [settings]);

  useEffect(() => {
    // Supabase is the cross-device source of truth for "the most recently generated schedule".
    loadSchedule()
      .then((cloud) => {
        if (cloud) {
          const next = hasPerformance() ? { ...cloud, sessions: refreshSessionMetrics(cloud.sessions, settings) } : cloud;
          setBundle(next);
          saveCurrentSchedule(next);
        }
      })
      .catch(() => {
        /* keep the local schedule */
      });
    // Restores settings and the draft history from the shared Supabase state, if present.
    loadCloud()
      .then((cloud) => {
        if (cloud?.settings) setSettings(cloud.settings as Settings);
        if (cloud?.drafts?.length) setDrafts(cloud.drafts);
      })
      .catch(() => {
        /* keep local settings/drafts */
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setSwapFor(null);
        setKpiKey(null);
        setAiOpen(false);
        setDayModal(null);
        setTimeModal(null);
        setSimilarFor(null);
        setCreateFor(null);
        setExportOpen(false);
        setWeekPickerOpen(false);
        setRailOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const location = locationById(locationId);
  const pinned = useMemo(() => bundle.sessions.filter((s) => s.pinned).map((s) => s.id), [bundle.sessions]);
  const all = useMemo(
    () => applySchedule(bundle.sessions, { pinned, reassigned, optimized: false }),
    [bundle.sessions, pinned, reassigned]
  );
  const sessions = useMemo(() => all.filter((s) => s.locationId === locationId), [all, locationId]);
  const kpis = kpisFor(sessions, pinned);
  const loads = trainerLoad(sessions);
  const ticker = tickerItems(sessions, location.name);
  const selected = sessions.find((s) => s.id === selectedId) ?? all.find((s) => s.id === selectedId) ?? null;

  function persistSettings(next = settings) {
    saveSettings(next);
    setSettings(next);
    setToast("Control settings saved");
    setTimeout(() => setToast(null), 2200);
  }

  function runAi(kind: "generate" | "optimize") {
    setAiOpen(true);
    setAiStep(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setAiStep(i);
      if (i >= AI_STEPS.length) {
        clearInterval(timer);
        const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
        const scoped = genLocationIds.length && genLocationIds.length < LOCATIONS.length ? genLocationIds : undefined;
        try {
          const generated = generateSchedule(settings, seed, kind === "optimize", scoped);
          const sessions = scoped
            ? [...bundle.sessions.filter((s) => !scoped.includes(s.locationId)), ...generated.sessions]
            : generated.sessions;
          const report = scoped ? complianceFor(sessions, settings) : generated.report;
          const next = { sessions, report };
          setBundle(next);
          saveCurrentSchedule(next);
          persistSchedule(next);
          const saved = pushDraft(next.report.hash, next.sessions);
          setDrafts(saved);
          persistCloud({ settings, drafts: saved, sessions: next.sessions });
          const aiOn = Boolean(ENV.openaiKey);
          const scopeLabel = scoped ? ` for ${scoped.map((id) => locationById(id).name).join(", ")}` : "";
          setToast(
            aiOn
              ? `AI draft ${next.report.hash} · ${generated.sessions.length} classes${scopeLabel}`
              : `Rules-based draft ${next.report.hash} · ${generated.sessions.length} classes${scopeLabel} — OpenAI is not configured in .env`
          );
          const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
          const pinnedCount = generated.sessions.filter((s) => s.tags.includes("protected")).length;
          const varietyCount = generated.sessions.filter(
            (s) => !s.tags.includes("protected") && (s.tags.includes("mix") || s.tags.includes("experimental") || s.tags.includes("constraint"))
          ).length;
          const byFormat: Record<string, number> = {};
          const byTrainer: Record<string, number> = {};
          for (const s of generated.sessions) {
            byFormat[s.name] = (byFormat[s.name] ?? 0) + 1;
            const trainerName = roster.find((t) => t.id === s.trainerId)?.name ?? s.trainerId;
            byTrainer[trainerName] = (byTrainer[trainerName] ?? 0) + 1;
          }
          setGenSummary({
            total: generated.sessions.length,
            pinned: pinnedCount,
            variety: varietyCount,
            ai: generated.sessions.length - pinnedCount - varietyCount,
            byFormat: Object.entries(byFormat).sort((a, b) => b[1] - a[1]),
            byTrainer: Object.entries(byTrainer).sort((a, b) => b[1] - a[1]),
          });
        } catch {
          setToast("Generation failed — check settings and try again");
          setAiOpen(false);
        }
        setReassigned({});
        setTimeout(() => setToast(null), 2400);
      }
    }, 10000);
  }

  function onSelect(s: Session) {
    setSelectedId(s.id);
  }

  const [swapFor, setSwapFor] = useState<Session | null>(null);
  const [copied, setCopied] = useState<Session | null>(null);
  const [dayModal, setDayModal] = useState<number | null>(null);
  const [timeModal, setTimeModal] = useState<string | null>(null);
  const [similarFor, setSimilarFor] = useState<Session | null>(null);
  const [drafts, setDrafts] = useState(() => loadDrafts());
  const [createFor, setCreateFor] = useState<{ locationId: string; day: number; time: string } | null>(null);

  function setSessions(next: Session[]) {
    setBundle((b) => {
      const updated = { ...b, sessions: next };
      saveCurrentSchedule(updated);
      persistSchedule(updated);
      return updated;
    });
  }

  const actions = {
    onSelect,
    onSwap: (s: Session) => setSwapFor(s),
    onRemove: (s: Session) => {
      setSessions(bundle.sessions.filter((x) => x.id !== s.id));
      setToast(`Removed ${s.name}`);
      setTimeout(() => setToast(null), 1800);
    },
    onCopy: (s: Session) => {
      setCopied(s);
      setToast(`Copied ${s.name} — drop or click an empty slot to paste`);
      setTimeout(() => setToast(null), 2200);
    },
    onSimilar: (s: Session) => setSimilarFor(s),
    onTogglePin: (s: Session) => {
      const existingPin = settings.pins.find(
        (p) => p.locationId === s.locationId && p.day === s.day && p.time === s.time && p.className === s.name && p.trainerId === s.trainerId
      );
      if (s.pinned || existingPin) {
        persistSettings({ ...settings, pins: settings.pins.filter((p) => p.id !== existingPin?.id) });
        setSessions(bundle.sessions.map((x) => (x.id === s.id ? { ...x, pinned: false, tags: x.tags.filter((t) => t !== "protected") } : x)));
        setToast(`Unpinned ${s.name} — future generations may replace it`);
      } else {
        const pin: Pin = {
          id: `pin-${Date.now()}`,
          locationId: s.locationId,
          day: s.day,
          time: s.time,
          className: s.name,
          trainerId: s.trainerId,
          note: "Pinned from schedule",
          enabled: true,
        };
        persistSettings({ ...settings, pins: [...settings.pins, pin] });
        setSessions(bundle.sessions.map((x) => (x.id === s.id ? { ...x, pinned: true, tags: [...new Set([...x.tags, "protected" as const])] } : x)));
        setToast(`Pinned ${s.name} — protected from future regenerations`);
      }
      setTimeout(() => setToast(null), 2200);
    },
  };

  function addFromHistoric(opt: { day: number; time: string; name: string; trainerId: string }) {
    const format = FORMATS.find((f) => f.name === opt.name);
    const trainer = TRAINERS.find((t) => t.id === opt.trainerId);
    if (!format || !trainer) return;
    const h = historicFor(locationId, opt.day, opt.time, format.name, trainer.id);
    const sc = scoreCombo(h, trainer, settings, format.name);
    const room = locationById(locationId).roomTypes?.[format.family] ?? format.studio;
    const capacity = locationById(locationId).roomCapacity?.[room] ?? 18;
    setSessions([
      ...bundle.sessions,
      {
        id: `${locationId}-${opt.day}-${opt.time}-${format.name}-${trainer.id}-${Date.now()}`,
        locationId,
        day: opt.day,
        time: opt.time,
        name: format.name,
        studio: room,
        duration: format.duration,
        trainerId: trainer.id,
        score: sc.score,
        fill: h.fill,
        avg: h.checkin,
        sessions: h.sessions,
        oneOff: sc.oneOff,
        reason: `Added from historic slot options. ${trainer.name} averages ${h.checkin} check-ins and ${h.fill}% fill over ${h.sessions} sessions.`,
        breakdown: sc.breakdown,
        capacity,
        tags: ["new"],
        accent: format.accent,
      },
    ]);
  }

  function createClass(opts: { locationId: string; day: number; time: string; format: (typeof FORMATS)[number]; trainer: (typeof TRAINERS)[number]; recurring: boolean }) {
    const { locationId: loc, day, time, format, trainer, recurring } = opts;
    const conflict = hasConflict(bundle.sessions, { id: "new", locationId: loc, day, time, trainerId: trainer.id, studio: format.studio, duration: format.duration });
    if (conflict) {
      setToast(conflict);
      setTimeout(() => setToast(null), 2600);
      return;
    }
    const h = historicFor(loc, day, time, format.name, trainer.id);
    const sc = scoreCombo(h, trainer, settings, format.name);
    const room = locationById(loc).roomTypes?.[format.family] ?? format.studio;
    const capacity = locationById(loc).roomCapacity?.[room] ?? 18;
    const session: Session = {
      id: `${loc}-${day}-${time}-${format.name.replace(/\s+/g, "-").toLowerCase()}-${trainer.id}-${Date.now()}`,
      locationId: loc,
      day,
      time,
      name: format.name,
      studio: room,
      duration: format.duration,
      trainerId: trainer.id,
      score: sc.score,
      fill: h.fill,
      avg: h.checkin,
      sessions: h.sessions,
      oneOff: sc.oneOff,
      reason: recurring
        ? `Manually created and pinned \u2014 protected from future regenerations.`
        : `Manually created for this week only.`,
      breakdown: sc.breakdown,
      capacity,
      tags: recurring ? ["protected", "new"] : ["new"],
      accent: format.accent,
      pinned: recurring,
    };
    setSessions([...bundle.sessions, session]);
    if (recurring) {
      persistSettings({
        ...settings,
        pins: [
          ...settings.pins,
          { id: `pin-${Date.now()}`, locationId: loc, day, time, className: format.name, trainerId: trainer.id, note: "Manually created", enabled: true },
        ],
      });
    }
    setCreateFor(null);
    setToast(`Added ${format.name} \u2014 ${trainer.name}`);
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="min-h-screen bg-white text-ivory">
      <div className="grain" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#005eed]/8 blur-[120px]" />
        <div className="absolute right-0 top-1/4 h-[26rem] w-[26rem] rounded-full bg-[#0e1729]/5 blur-[120px]" />
      </div>

      <div className="relative flex min-h-screen">
        <aside
          className={`${
            railOpen ? "fixed inset-y-0 left-0 z-40" : "hidden"
          } w-[88px] flex-col border-r border-line bg-white/80 backdrop-blur-xl lg:flex`}
        >
          <div className="flex h-[72px] items-center justify-center border-b border-line">
            <button onClick={() => { setView("grid"); setLocationId("kwality"); setSelectedId(null); setKpiKey(null); }} title="Home">
              <img src="/images/athena-mark.png" alt="Athena" className="h-10 w-10 rounded-xl object-cover ring-1 ring-line" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col items-center gap-1 py-3">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                title={v.label}
                data-active={view === v.id}
                onClick={() => {
                  setView(v.id);
                  setRailOpen(false);
                }}
                className="rail-btn flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-mist transition hover:text-ivory"
              >
                <v.icon className="h-4 w-4" />
                <span className="mt-1 text-[8px] uppercase tracking-wider">{v.label.split("-")[0]}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hide-scroll relative z-20 flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-line bg-white px-4 py-3 lg:px-6">
            <button
              className="shrink-0 rounded-xl p-2 text-mist ring-1 ring-line lg:hidden"
              onClick={() => setRailOpen((o) => !o)}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <div className="min-w-[180px] shrink-0">
              <p className="font-serif text-[28px] leading-none tracking-tight text-ivory">
                Athena <span className="italic text-gold">Scheduler</span>
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-mist">AI class schedule intelligence</p>
            </div>
            <div className="relative w-40 shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-line bg-[#efefef] py-2 pl-8 pr-2 text-xs outline-none placeholder:text-mist/70 focus:border-[#005eed]"
              />
            </div>
            <div className="relative shrink-0">
              <button
                onClick={() => setWeekPickerOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs text-mist ring-1 ring-line hover:ring-[#005eed]/40"
              >
                <Sun className="h-3.5 w-3.5 text-gold" />
                Week of {fmtShort(weekStart)} – {fmtShort(new Date(weekStart.getTime() + 6 * 86400000))}
              </button>
              {weekPickerOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 rounded-2xl border border-line bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-mist">Pick any date in the week</p>
                  <input
                    type="date"
                    value={isoDate(weekStart)}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setWeekStart(mondayOf(new Date(e.target.value)));
                      setWeekPickerOpen(false);
                    }}
                    className="rounded-xl border border-line px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <Dropdown
              value={locationId}
              onChange={setLocationId}
              className="shrink-0 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs text-ivory ring-1 ring-line hover:text-mist"
              options={LOCATIONS.map((loc) => ({
                value: loc.id,
                label: `${loc.name} · ${all.filter((s) => s.locationId === loc.id).length}`,
              }))}
            />
            <div className="flex shrink-0 flex-nowrap gap-2">
              <div className="relative shrink-0">
                <button onClick={() => setExportOpen((o) => !o)} className="whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs text-mist ring-1 ring-line hover:text-ivory">
                  Export
                </button>
                {exportOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-40 space-y-1 rounded-2xl border border-line bg-white p-2 text-xs shadow-2xl">
                    {([
                      ["CSV", () => exportCSV(sessions)],
                      ["JSON", () => exportJSON(sessions, bundle.report)],
                      ["HTML", () => exportHTML(sessions)],
                      ["PDF", () => exportPDF(sessions)],
                      ["PNG", () => exportPNG(sessions, location.name)],
                    ] as const).map(([label, fn]) => (
                      <button
                        key={label}
                        onClick={() => {
                          fn();
                          setExportOpen(false);
                        }}
                        className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-ink"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={async () => {
                  const ok = await finalizeSchedule(isoDate(weekStart), bundle);
                  setToast(ok ? `Finalized schedule saved for week of ${fmtShort(weekStart)}` : "Could not save to Supabase — check connection");
                  setTimeout(() => setToast(null), 2600);
                }}
                className="shrink-0 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs text-mist ring-1 ring-line hover:text-ivory"
              >
                Finalize schedule
              </button>
              <MultiSelect
                className="w-32 shrink-0"
                options={LOCATIONS.map((l) => ({ value: l.id, label: l.name }))}
                selected={genLocationIds}
                onChange={setGenLocationIds}
                placeholder="All locations"
              />
              <button
                onClick={() => runAi("generate")}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0e1729] px-3 py-2 text-xs font-semibold text-white"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate with AI
              </button>
              <button
                onClick={() => runAi("optimize")}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#005eed] px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_-10px_rgba(0,94,237,0.55)]"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Optimize
              </button>
            </div>
          </header>

          <div className="overflow-hidden border-b border-line bg-[#efefef]">
            <div className="marquee flex w-max gap-6 py-2 pr-6 text-[11px]">
              {[...ticker, ...ticker].map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  <span className="text-mist">{item.label}</span>
                  <span
                    className={
                      item.tone === "good"
                        ? "text-emerald-700"
                        : item.tone === "warn"
                          ? "text-amber-700"
                          : item.tone === "bad"
                            ? "text-rose-700"
                            : item.tone === "gold"
                              ? "text-gold"
                              : "text-ivory"
                    }
                  >
                    {item.value}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 lg:px-6">
            {LOCATIONS.map((loc) => {
              const active = loc.id === locationId;
              const n = all.filter((s) => s.locationId === loc.id).length;
              return (
                <button
                  key={loc.id}
                  onClick={() => setLocationId(loc.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                    active ? "bg-gold text-white" : "bg-white text-mist ring-1 ring-line hover:text-ivory"
                  }`}
                >
                  {loc.name}
                  <span className={`ml-2 text-[10px] ${active ? "text-white/80" : "text-mist"}`}>{n}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3 xl:grid-cols-9 lg:px-6">
            {kpis.map((k) => (
              <button key={k.key} onClick={() => setKpiKey(k.key)} className="panel rounded-2xl px-3 py-3 text-left">
                <p className="text-[9px] uppercase tracking-[0.16em] text-mist">{k.label}</p>
                <p
                  className={`mt-1 font-serif text-[26px] leading-none ${
                    k.tone === "good" ? "text-emerald-700" : k.tone === "warn" ? "text-amber-700" : k.tone === "bad" ? "text-rose-700" : "text-ivory"
                  }`}
                >
                  {k.value}
                </p>
                <p className="mt-1 text-[10px] text-mist">{k.hint}</p>
              </button>
            ))}
          </div>

          {(view === "grid" || view === "trainer") && (
            <div className="px-4 pb-3 lg:px-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.2em] text-mist">Trainer workload</p>
                <p className="text-[11px] text-mist">{loads.length} on the floor</p>
              </div>
              <div className="hide-scroll flex gap-2 overflow-x-auto pb-1">
                {loads.map((t) => {
                  const active = focusTrainer === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setFocusTrainer(active ? null : t.id)}
                      className={`min-w-[132px] rounded-2xl p-2.5 text-left ring-1 transition ${
                        active ? "bg-gold/10 ring-gold/40" : "bg-white ring-line hover:ring-gold/25"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img src={t.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-ivory">{t.name.split(" ")[0]}</p>
                          <p className="text-[10px] text-mist">{t.hours}h · {t.classes}</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, t.hours * 10)}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {perfCount > 0 && (
            <p className="px-4 text-[11px] text-mist lg:px-6">Scoring from {perfCount.toLocaleString()} source-sheet sessions (Hosted / Foundations / SWEAT excluded).</p>
          )}
          <main className="min-h-0 flex-1 px-4 pb-8 lg:px-6">
            {view === "grid" && (
              <GridView
                sessions={sessions}
                all={all}
                locationId={locationId}
                pinned={pinned}
                focusTrainer={focusTrainer}
                query={query}
                actions={actions}
                onAdd={(opt) => {
                  if (copied) {
                    setSessions([...bundle.sessions, { ...copied, id: `${copied.id}-copy-${Date.now()}`, day: opt.day, time: opt.time, locationId, reason: `Pasted from ${DAYS[copied.day].label} ${copied.time}` }]);
                    return;
                  }
                  addFromHistoric(opt);
                }}
                onDropSession={(id, day, time) => {
                  const moving = bundle.sessions.find((s) => s.id === id);
                  if (!moving) return;
                  const conflict = hasConflict(bundle.sessions, { ...moving, day, time }, id);
                  if (conflict) {
                    setToast(conflict);
                    setTimeout(() => setToast(null), 2600);
                    return;
                  }
                  setSessions(bundle.sessions.map((s) => (s.id === id ? { ...s, day, time, reason: `Moved to ${DAYS[day].label} ${time}` } : s)));
                }}
                onDayClick={setDayModal}
                onTimeClick={setTimeModal}
                onOpenCreate={(day, time) => setCreateFor({ locationId, day, time })}
              />
            )}
            {view === "timeline" && <TimelineView sessions={sessions} onSelect={onSelect} />}
            {view === "list" && <ListView sessions={sessions} pinned={pinned} onSelect={onSelect} />}
            {view === "trainer" && <TrainerView sessions={all} onSelect={onSelect} />}
            {view === "multi" && <MultiView all={all} actions={actions} onOpenCreate={(loc, day, time) => setCreateFor({ locationId: loc, day, time })} />}
            {view === "city" && <CityView all={all} actions={actions} onJump={(id) => { setLocationId(id); setView("grid"); }} />}
            {view === "heatmap" && <HeatmapView sessions={sessions} />}
            {view === "rooms" && <RoomsView sessions={sessions} all={all} actions={actions} />}
            {view === "analytics" && <AnalyticsView sessions={sessions} all={all} />}
            {view === "control" && <ControlView sessions={sessions} onSelect={onSelect} report={bundle.report} />}
            {view === "settings" && (
              <SettingsView settings={settings} setSettings={setSettings} onSave={() => persistSettings(settings)} />
            )}
            {view === "report" && <ReportView sessions={sessions} locationName={location.name} all={all} />}
          </main>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#0e1729] px-4 py-2 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      {kpiKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setKpiKey(null)}>
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase text-mist">Metric drill-down</p>
                <h3 className="font-serif text-3xl">{kpis.find((k) => k.key === kpiKey)?.label}</h3>
              </div>
              <button onClick={() => setKpiKey(null)} className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory" aria-label="Close metric drill-down">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 font-serif text-5xl text-[#005eed]">{kpis.find((k) => k.key === kpiKey)?.value}</p>
            <p className="mt-2 text-sm text-mist">{kpis.find((k) => k.key === kpiKey)?.hint}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Classes", sessions.length],
                ["Avg fill", `${Math.round(sessions.reduce((a, s) => a + s.fill, 0) / (sessions.length || 1))}%`],
                ["Avg score", Math.round(sessions.reduce((a, s) => a + s.score, 0) / (sessions.length || 1))],
                ["Avg check-in", (sessions.reduce((a, s) => a + s.avg, 0) / (sessions.length || 1)).toFixed(1)],
                ["Trainers used", new Set(sessions.map((s) => s.trainerId)).size],
                ["One-off", sessions.filter((s) => s.oneOff).length],
                ["Low fill", sessions.filter((s) => s.tags.includes("low")).length],
                ["Pinned", sessions.filter((s) => s.pinned).length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-ink p-2.5 text-center">
                  <p className="font-serif text-xl">{value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-mist">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 max-h-[50vh] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="uppercase text-mist">
                    <th className="py-2">Day</th>
                    <th>Time</th>
                    <th>Class</th>
                    <th>Studio</th>
                    <th>Duration</th>
                    <th>Trainer</th>
                    <th>Fill</th>
                    <th>Avg</th>
                    <th>Hist</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-1.5">{DAYS[s.day].label}</td>
                      <td>{s.time}</td>
                      <td>{s.name}</td>
                      <td>{s.studio}</td>
                      <td>{s.duration}m</td>
                      <td>{trainerById(s.trainerId).name}</td>
                      <td>{s.fill}%</td>
                      <td>{s.avg}</td>
                      <td>{s.sessions}</td>
                      <td>{s.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="mt-5 rounded-xl bg-[#0e1729] px-4 py-2 text-sm text-white" onClick={() => setKpiKey(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {selected && <ClassModal session={selected} all={all} onClose={() => setSelectedId(null)} />}

      {createFor && (
        <CreateClassModal
          all={bundle.sessions}
          settings={settings}
          locationId={createFor.locationId}
          day={createFor.day}
          time={createFor.time}
          onClose={() => setCreateFor(null)}
          onCreate={createClass}
        />
      )}

      {swapFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSwapFor(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-mist">Replace trainer</p>
                <h3 className="font-serif text-2xl">{swapFor.name}</h3>
                <p className="text-sm text-mist">
                  {DAYS[swapFor.day].label} {swapFor.time} · current {trainerById(swapFor.trainerId).name}
                </p>
              </div>
              <button onClick={() => setSwapFor(null)} className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory" aria-label="Close trainer replacement">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {topTrainersFor(all, swapFor.locationId, swapFor.day, swapFor.time, swapFor.name).map((c, i) => (
                <button
                  key={c.trainer.id}
                  onClick={() => {
                    recordOverride(swapFor.locationId, swapFor.day, swapFor.time, swapFor.name, swapFor.trainerId, c.trainer.id);
                    const h = historicFor(swapFor.locationId, swapFor.day, swapFor.time, swapFor.name, c.trainer.id);
                    const sc = scoreCombo(h, c.trainer, settings, swapFor.name);
                    setSessions(bundle.sessions.map((s) => (s.id === swapFor.id ? {
                      ...s,
                      trainerId: c.trainer.id,
                      score: sc.score,
                      fill: h.fill,
                      avg: h.checkin,
                      sessions: h.sessions,
                      oneOff: sc.oneOff,
                      breakdown: sc.breakdown,
                      reason: `Manual swap to ${c.trainer.name}. Historic fit: ${h.checkin} avg check-ins, ${h.fill}% fill across ${h.sessions} sessions.`,
                    } : s)));
                    setSwapFor(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-ink px-3 py-2 text-left"
                >
                  <img src={c.trainer.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.trainer.name} {i === 0 && <span className="text-[10px] text-[#005eed]">Best fit</span>}
                    </p>
                    <p className="text-[11px] text-mist">
                      {c.hours}h this week · {c.checkin} avg · {c.fill}% fill · {c.sessions} sessions
                    </p>
                  </div>
                  <span className="text-sm">{c.score}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {dayModal != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDayModal(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-2xl">{DAYS[dayModal].full} at {location.name}</h3>
              <button onClick={() => setDayModal(null)} className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory" aria-label="Close day mix">
                <X className="h-4 w-4" />
              </button>
            </div>
            {(() => {
              const day = sessions.filter((s) => s.day === dayModal);
              const shifts: Array<"am" | "pm"> = ["am", "pm"];
              const levels: Array<"Beginner" | "Intermediate" | "Advanced"> = ["Beginner", "Intermediate", "Advanced"];
              return (
                <div className="my-4 grid grid-cols-2 gap-3">
                  {shifts.map((sh) => (
                    <div key={sh} className="rounded-2xl bg-ink p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-mist">{sh === "am" ? "Morning" : "Evening"}</p>
                      {levels.map((lvl) => {
                        const count = day.filter((s) => (s.time < "13:00" ? "am" : "pm") === sh && levelOf(s.name) === lvl).length;
                        return (
                          <div key={lvl} className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-mist">{lvl}</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="uppercase text-mist"><th className="py-2">Time</th><th>Class</th><th>Level</th><th>Trainer</th><th>Fill</th></tr>
              </thead>
              <tbody>
                {sessions.filter((s) => s.day === dayModal).sort((a,b)=>a.time.localeCompare(b.time)).map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-1.5">{s.time}</td><td>{s.name}</td><td>{levelOf(s.name)}</td><td>{trainerById(s.trainerId).name}</td><td>{s.fill}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {timeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTimeModal(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-2xl">{timeModal} mix · {location.name}</h3>
              <button onClick={() => setTimeModal(null)} className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory" aria-label="Close time mix">
                <X className="h-4 w-4" />
              </button>
            </div>
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="uppercase text-mist"><th className="py-2">Day</th><th>Class</th><th>Trainer</th><th>Fill</th></tr>
              </thead>
              <tbody>
                {sessions.filter((s) => s.time === timeModal).map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-1.5">{DAYS[s.day].label}</td><td>{s.name}</td><td>{trainerById(s.trainerId).name}</td><td>{s.fill}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {similarFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSimilarFor(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-serif text-2xl">Better options at {similarFor.time}</h3>
                <p className="text-sm text-mist">Not limited to the same format or trainer — ranked by historic fill and attendance.</p>
              </div>
              <button onClick={() => setSimilarFor(null)} className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory" aria-label="Close better options">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {slotHistory(similarFor.locationId, similarFor.day, similarFor.time)
                .filter((h) => h.score >= similarFor.score - 5)
                .slice(0, 8)
                .map((h) => (
                  <button
                    key={h.name + h.trainerId}
                    onClick={() => {
                      const format = FORMATS.find((f) => f.name === h.name);
                      if (!format) return;
                      const trainer = TRAINERS.find((t) => t.id === h.trainerId);
                      const hist = historicFor(similarFor.locationId, similarFor.day, similarFor.time, h.name, h.trainerId);
                      const sc = trainer ? scoreCombo(hist, trainer, settings, h.name) : { score: h.score, oneOff: h.oneOff, breakdown: similarFor.breakdown };
                      const room = locationById(similarFor.locationId).roomTypes?.[format.family] ?? format.studio;
                      const capacity = locationById(similarFor.locationId).roomCapacity?.[room] ?? similarFor.capacity;
                      setSessions(bundle.sessions.map((s) => s.id === similarFor.id ? {
                        ...s,
                        name: h.name,
                        trainerId: h.trainerId,
                        score: sc.score,
                        fill: hist.fill,
                        avg: hist.checkin,
                        sessions: hist.sessions,
                        oneOff: sc.oneOff,
                        breakdown: sc.breakdown,
                        studio: room,
                        duration: format.duration,
                        capacity,
                        accent: format.accent,
                        reason: `Swapped to a stronger historic option: ${h.name}. Historic fit: ${hist.checkin} avg check-ins, ${hist.fill}% fill across ${hist.sessions} sessions.`,
                      } : s));
                      setSimilarFor(null);
                    }}
                    className="flex w-full justify-between rounded-2xl bg-ink px-3 py-2 text-left text-sm"
                  >
                    <span>{h.name} · {trainerById(h.trainerId).name}</span>
                    <span>{h.score} · {h.fill}% · {h.checkin} avg</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {drafts.length > 0 && view === "control" && (
        <div className="fixed bottom-24 left-6 z-30 space-y-1 rounded-2xl bg-white p-3 text-xs shadow ring-1 ring-line">
          <p className="font-semibold">Last 3 drafts</p>
          {drafts.map((d) => (
            <button key={d.id} className="block text-left text-[#005eed]" onClick={() => setBundle((b) => { const next = { ...b, sessions: d.sessions, report: { ...b.report, hash: d.hash } }; saveCurrentSchedule(next); persistSchedule(next); return next; })}>
              {d.hash} · {new Date(d.createdAt).toLocaleTimeString()}
            </button>
          ))}
        </div>
      )}
      <Chatbot all={bundle.sessions} setAll={setSessions} settings={{ ...settings, ai: { ...settings.ai, openaiKey: ENV.openaiKey || settings.ai.openaiKey, openaiModel: ENV.openaiModel || settings.ai.openaiModel } }} locationId={locationId} />

      {aiOpen && !genSummary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0e1729]/70 backdrop-blur-md">
          <div className="w-[min(520px,92vw)] rounded-[28px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#005eed]">Scoring · ranking · packing</p>
                <h3 className="mt-2 font-serif text-3xl">Building the week</h3>
              </div>
              <button onClick={() => setAiOpen(false)} className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory" aria-label="Close generation progress">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-mist">About two minutes — enough time to test trainer clusters, fill Supreme, and drop conflicts.</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-[#005eed] transition-all" style={{ width: `${Math.min(100, (aiStep / AI_STEPS.length) * 100)}%` }} />
            </div>
            <p className="mt-2 text-right text-[11px] text-mist">
              {aiStep}/{AI_STEPS.length}
            </p>
            <div className="mt-4 max-h-56 space-y-1.5 overflow-auto">
              {AI_STEPS.map((step, i) => (
                <div key={step} className={`flex gap-2 rounded-2xl px-3 py-2 text-sm ${i === aiStep ? "bg-[#eef4ff] text-[#005eed]" : i < aiStep ? "text-ivory" : "text-mist"}`}>
                  <span className="w-5 tabular-nums">{i < aiStep ? "✓" : i === aiStep ? "●" : "○"}</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {aiOpen && genSummary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0e1729]/70 backdrop-blur-md">
          <div className="max-h-[88vh] w-[min(680px,92vw)] overflow-y-auto rounded-[28px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#005eed]">Generation report</p>
                <h3 className="mt-2 font-serif text-3xl">{genSummary.total} classes decided</h3>
              </div>
              <button
                onClick={() => {
                  setAiOpen(false);
                  setGenSummary(null);
                }}
                className="rounded-xl p-2 text-mist hover:bg-ink hover:text-ivory"
                aria-label="Close report"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-ink p-4">
                <p className="text-2xl font-semibold tabular-nums text-[#0e1729]">{genSummary.ai}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-mist">Decided by AI</p>
              </div>
              <div className="rounded-2xl bg-ink p-4">
                <p className="text-2xl font-semibold tabular-nums text-[#0e1729]">{genSummary.pinned}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-mist">From pins</p>
              </div>
              <div className="rounded-2xl bg-ink p-4">
                <p className="text-2xl font-semibold tabular-nums text-[#0e1729]">{genSummary.variety}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-mist">Added for mix / balance</p>
              </div>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mist">By format</p>
                <div className="space-y-1.5">
                  {genSummary.byFormat.map(([name, count]) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <span className="w-32 truncate">{name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
                        <div className="h-full rounded-full bg-[#005eed]" style={{ width: `${(count / genSummary.total) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right tabular-nums text-mist">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mist">By trainer</p>
                <div className="space-y-1.5">
                  {genSummary.byTrainer.map(([name, count]) => (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <span className="w-32 truncate">{name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
                        <div className="h-full rounded-full bg-[#0e1729]" style={{ width: `${(count / genSummary.total) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right tabular-nums text-mist">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setAiOpen(false);
                setGenSummary(null);
              }}
              className="mt-6 w-full rounded-xl bg-[#0e1729] py-2.5 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
