import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Award, Check, ChevronDown, Copy, PencilLine, Pin, PinOff, Search, Sparkles, Trash2, UserRound } from "lucide-react";
import { DAYS, TAG_META, TRAINERS, trainerById, trainerLoad } from "./data";
import { slotHistory } from "./engine";
import type { MatchTier, Session, Tag } from "./types";

const CLASS_ACCENTS: Record<string, string> = {
  "Barre 57": "#15243d",
  "Barre 57 Express": "#3a516f",
  "Cardio Barre": "#e05252",
  "Cardio Barre Plus": "#bd3f77",
  "Cardio Barre Express": "#ea6a3d",
  "Mat 57": "#005eed",
  "Mat 57 Express": "#4387ee",
  PowerCycle: "#7655d6",
  "PowerCycle Express": "#9a72e5",
  "Strength Lab": "#16866f",
  FIT: "#08a0b5",
  "Amped Up!": "#d98317",
  HIIT: "#d74444",
  "Back Body Blaze": "#8b5d3b",
  Recovery: "#5d7997",
};

function classAccent(name: string, fallback: string) {
  if (CLASS_ACCENTS[name]) return CLASS_ACCENTS[name];
  const palette = ["#2855a6", "#7b4cb0", "#b1486f", "#397c68", "#a05b32", "#376b95"];
  const hash = [...name].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  return palette[hash % palette.length] || fallback;
}

export function ScoreRing({ score, size = 36, color }: { score: number; size?: number; color?: string }) {
  const r = size * 0.38;
  const c = 2 * Math.PI * r;
  const ringColor = color || (score >= 80 ? "#16a34a" : score >= 65 ? "#005eed" : "#e05a3c");
  return (
    <svg width={size} height={size} className="score-ring shrink-0">
      <circle className="score-ring-track" cx={size / 2} cy={size / 2} r={r} stroke="rgba(14,23,41,0.1)" strokeWidth="2.5" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={ringColor}
        strokeWidth="2.5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="currentColor" fontSize={size < 34 ? 8 : 10} fontWeight="600" fontFamily="Outfit, sans-serif">
        {score > 0 ? score : "—"}
      </text>
    </svg>
  );
}

export function TagChip({ tag }: { tag: Tag }) {
  const meta = TAG_META[tag];
  return <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide ring-1 ring-inset ${meta.cls}`}>{meta.label}</span>;
}

export function FillBar({ fill, avg, sessions, color }: { fill: number; avg?: number; sessions?: number; color?: string }) {
  const barColor = color || (fill >= 70 ? "#005eed" : fill >= 40 ? "#0e1729" : "#e05a3c");
  const showCardMetrics = avg !== undefined && sessions !== undefined;
  const hasHistory = showCardMetrics ? sessions > 0 : true;
  return (
    <div className="class-metric" aria-label={hasHistory ? `${avg?.toFixed(1) ?? ""} class average and ${fill}% fill rate${sessions !== undefined ? ` across ${sessions} sessions` : ""}` : "No matching class history"}>
      {showCardMetrics && <div className="class-metric-labels">
        <span>Avg <span className="class-metric-value">{hasHistory ? avg.toFixed(1) : "—"}</span></span>
        <span>Fill <span className="class-metric-value">{hasHistory ? `${fill}%` : "—"}</span></span>
        <span className="class-metric-sessions">{hasHistory ? `${sessions} ${sessions === 1 ? "session" : "sessions"}` : "No history"}</span>
      </div>}
      <div className="class-metric-track">
        <div className="class-metric-fill" style={{ width: `${hasHistory ? Math.max(0, Math.min(fill, 100)) : 0}%`, background: barColor }} />
      </div>
    </div>
  );
}

export type CardActions = {
  onSelect: (s: Session) => void;
  onSwap?: (s: Session) => void;
  onRemove?: (s: Session) => void;
  onCopy?: (s: Session) => void;
  onSimilar?: (s: Session) => void;
  onTogglePin?: (s: Session) => void;
};

const MATCH_LABELS: Record<MatchTier, string> = {
  exact: "Perfect match",
  "slot-format": "Format match",
  "format-day": "Day only",
  "format-time": "Time only",
  "nearby-exact": "Nearby perfect",
  "nearby-format": "Nearby format",
  "trainer-format": "Trainer history",
  "trainer-only": "Trainer only",
  "format-only": "Format only",
  none: "No match",
};

export function matchLabel(tier?: MatchTier) {
  return MATCH_LABELS[tier ?? "none"];
}

export function ClassCard({
  session,
  dimmed,
  pinned,
  weekHours,
  actions,
  compact,
  discontinued,
}: {
  session: Session;
  dimmed?: boolean;
  pinned?: boolean;
  weekHours?: number;
  actions: CardActions;
  compact?: boolean;
  discontinued?: boolean;
}) {
  const trainer = trainerById(session.trainerId);
  const studioLabel = session.studio === "PowerCycle Studio" ? "Cycle" : session.studio;
  const accent = classAccent(session.name, session.accent);
  const isBestTrainer = session.tags.includes("best");
  const isNewClass = session.tags.includes("new");
  if (compact) {
    return (
      <div
        draggable={!discontinued}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/session-id", session.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`ticket schedule-class-card schedule-class-card-compact group relative w-full ${discontinued ? "cursor-default schedule-class-card-discontinued" : "cursor-grab"} overflow-hidden rounded-xl p-2 text-left transition hover:shadow-lg ${dimmed ? "schedule-class-card-dimmed" : ""} ${
          session.tags.includes("violation") ? "ring-1 ring-red-300" : "ring-1 ring-line hover:ring-[#005eed]/40"
        }`}
      >
        <button className="w-full text-left" onClick={() => !discontinued && actions.onSelect(session)}>
          <span className="class-card-accent" style={{ background: accent }} />
          <div className="flex items-start justify-between gap-1 pl-1.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium leading-tight text-ivory">{session.name}</p>
              <p className="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-mist">{studioLabel}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#0e1729]" style={{ boxShadow: `inset 0 0 0 1.5px ${accent}` }}>{session.score || "—"}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 pl-1.5">
            <img src={trainer.photo} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-line" />
            <span className="min-w-0 flex-1 truncate text-[9px] text-ivory/70">{trainer.name.split(" ")[0]}</span>
            <span className="shrink-0 text-[9px] tabular-nums text-mist">{session.time}</span>
          </div>
          <div className="mt-2 pl-1.5">
            <FillBar fill={session.fill} avg={session.avg} sessions={session.sessions} color={accent} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-1.5">
            <MatchBadge tier={session.matchTier} />
            {isBestTrainer && <StatusBadge kind="best" />}
            {isNewClass && <StatusBadge kind="new" />}
            {session.oneOff && <span className="class-status-badge">One-off</span>}
            {pinned && <span className="class-status-badge class-status-badge-blue">Pinned</span>}
            {session.tags.includes("private") && <span className="class-status-badge class-status-badge-private">Private</span>}
            {session.tags.includes("hosted") && <span className="class-status-badge class-status-badge-hosted">Hosted</span>}
            {discontinued && <span className="class-status-badge">Discontinued</span>}
          </div>
        </button>
        {!discontinued && <div className="cc-actions grid max-h-0 grid-cols-5 gap-1 overflow-hidden opacity-0 transition-all duration-200 group-hover:mt-1 group-hover:max-h-10 group-hover:pt-1 group-hover:opacity-100">
          <IconBtn title={pinned ? "Unpin class" : "Pin class"} onClick={() => actions.onTogglePin?.(session)}>
            {pinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
          </IconBtn>
          <IconBtn title="Change trainer" onClick={() => actions.onSwap?.(session)}>
            <UserRound className="h-2.5 w-2.5" />
          </IconBtn>
          <IconBtn title="Copy card" onClick={() => actions.onCopy?.(session)}>
            <Copy className="h-2.5 w-2.5" />
          </IconBtn>
          <IconBtn title="Find similar" onClick={() => actions.onSimilar?.(session)}>
            <Search className="h-2.5 w-2.5" />
          </IconBtn>
          <IconBtn title="Remove class" onClick={() => actions.onRemove?.(session)}>
            <Trash2 className="h-2.5 w-2.5" />
          </IconBtn>
        </div>}
      </div>
    );
  }
  return (
    <div
      draggable={!discontinued}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/session-id", session.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`ticket schedule-class-card group relative w-full ${discontinued ? "cursor-default schedule-class-card-discontinued" : "cursor-grab"} overflow-hidden rounded-2xl p-3 text-left transition ${dimmed ? "schedule-class-card-dimmed" : ""} ${
        session.tags.includes("violation") ? "ring-1 ring-red-300" : "ring-1 ring-line hover:ring-[#005eed]/40"
      }`}
    >
      <button className="w-full text-left" onClick={() => !discontinued && actions.onSelect(session)}>
        <span className="class-card-accent" style={{ background: accent }} />
        <div className="flex items-start justify-between gap-2 pl-1.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ivory">{session.name}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-mist">{studioLabel}</p>
          </div>
          <ScoreRing score={session.score} color={accent} />
        </div>
        <div className="mt-2.5 flex items-center gap-2 pl-1.5">
          <img src={trainer.photo} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-line" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-ivory/80">{trainer.name}</span>
          <span className="text-[10px] tabular-nums text-mist">{session.time}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 pl-1.5">
          <MatchBadge tier={session.matchTier} />
          {isBestTrainer && <StatusBadge kind="best" />}
          {isNewClass && <StatusBadge kind="new" />}
          {session.oneOff && <span className="class-status-badge">One-off</span>}
          {pinned && <span className="class-status-badge class-status-badge-blue">Pinned</span>}
          {session.tags.includes("private") && <span className="class-status-badge class-status-badge-private">Private</span>}
          {session.tags.includes("hosted") && <span className="class-status-badge class-status-badge-hosted">Hosted</span>}
          {discontinued && <span className="class-status-badge">Discontinued</span>}
          {(weekHours ?? 0) > 0 && <span className="ml-auto text-[9px] tabular-nums text-mist">{weekHours}h this week</span>}
        </div>
        <div className="mt-2 pl-1.5">
          <FillBar fill={session.fill} avg={session.avg} sessions={session.sessions} color={accent} />
        </div>
      </button>
      {!discontinued && <div className="cc-actions grid max-h-0 grid-cols-5 gap-1 overflow-hidden opacity-0 transition-all duration-200 group-hover:mt-1 group-hover:max-h-10 group-hover:pt-1 group-hover:opacity-100">
        <IconBtn title={pinned ? "Unpin class" : "Pin class"} onClick={() => actions.onTogglePin?.(session)}>
          {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </IconBtn>
        <IconBtn title="Change trainer" onClick={() => actions.onSwap?.(session)}>
          <UserRound className="h-3 w-3" />
        </IconBtn>
        <IconBtn title="Copy card" onClick={() => actions.onCopy?.(session)}>
          <Copy className="h-3 w-3" />
        </IconBtn>
        <IconBtn title="Find similar" onClick={() => actions.onSimilar?.(session)}>
          <Search className="h-3 w-3" />
        </IconBtn>
        <IconBtn title="Remove class" onClick={() => actions.onRemove?.(session)}>
          <Trash2 className="h-3 w-3" />
        </IconBtn>
      </div>}
    </div>
  );
}

function StatusBadge({ kind }: { kind: "best" | "new" }) {
  const best = kind === "best";
  return (
    <span className={`class-status-badge ${best ? "class-status-badge-best" : "class-status-badge-new"}`} title={best ? "Scheduled with the best trainer" : "New on the schedule"}>
      {best ? <Award className="h-2.5 w-2.5" aria-hidden="true" /> : <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />}
      {best ? "Best trainer" : "New"}
    </span>
  );
}

function MatchBadge({ tier }: { tier?: MatchTier }) {
  return (
    <span className={`class-match-badge class-match-${tier ?? "none"}`} title={`Historic scoring basis: ${matchLabel(tier)}`}>
      {matchLabel(tier)}
    </span>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={title}
      className="class-card-action flex min-h-7 items-center justify-center rounded-lg bg-white p-1.5 text-[#0e1729] hover:bg-[#005eed] hover:text-white"
    >
      {children}
    </button>
  );
}

export function EmptySlot({
  locationId,
  day,
  time,
  onAdd,
  onOpenCreate,
}: {
  locationId: string;
  day: number;
  time: string;
  onAdd?: (opt: { name: string; trainerId: string }) => void;
  onOpenCreate?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const hist = hover ? slotHistory(locationId, day, time).slice(0, 3) : [];
  const top = hist[0];
  return (
    <div
      className="group relative min-h-[72px] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-line p-1.5 transition hover:border-[#005eed]/30"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpenCreate?.()}
      title="Click to create a class in this slot"
    >
      {!hover && <span className="flex h-full items-center justify-center text-lg text-mist/30">+</span>}
      {hover && (
        <div className="space-y-1 opacity-60 transition-opacity duration-150 hover:opacity-90">
          <p className="text-[9px] uppercase tracking-wider text-mist">Historic suggestions · {DAYS[day].label} {time}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreate?.();
            }}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-[#005eed] ring-1 ring-line hover:bg-[#0e1729] hover:text-white"
          >
            <PencilLine className="h-3 w-3" />
            Create custom class
          </button>
          {!top && <p className="text-[10px] text-mist">No proven combo \u2014 click to build one manually.</p>}
          {hist.map((h) => {
            const t = trainerById(h.trainerId);
            return (
              <button
                key={h.name + h.trainerId}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd?.({ name: h.name, trainerId: h.trainerId });
                }}
                className="block w-full rounded-lg px-1 py-0.5 text-left text-[10px] text-mist hover:bg-white/60 hover:text-ivory"
              >
                <span className="font-medium">{h.name}</span> · {t.name.split(" ")[0]} · {h.score} · {matchLabel(h.matchTier)} · {h.checkin} avg · {h.fill}% fill
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`panel rounded-3xl ${className}`}>{children}</div>;
}

// Portals its open panel to document.body and positions it with `fixed` coords computed from the
// trigger's bounding rect. Needed because any ancestor with overflow-x/y-auto (e.g. a scrolling
// header) clips ordinary `absolute` popups — `fixed` escapes that clipping entirely.
export function usePortalPanel<T extends HTMLElement>() {
  const triggerRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const openPanel = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setOpen(true);
  };
  const close = () => setOpen(false);
  return { triggerRef, open, pos, openPanel, close, toggle: () => (open ? close() : openPanel()) };
}

export function PortalPanel({ pos, onClose, children }: { pos: { top: number; left: number; width: number }; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[998]" onClick={onClose} />
      <div
        className="fixed z-[999] max-h-64 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-2xl"
        style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

// Multi-select dropdown — panel portals out of the DOM tree so scrolling/overflow ancestors
// (e.g. a horizontally-scrolling header) never clip it.
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  className = "",
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const { triggerRef, open, pos, toggle, close } = usePortalPanel<HTMLButtonElement>();
  const toggleValue = (value: string) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const allOn = options.length > 0 && options.every((o) => selected.includes(o.value));
  const label = selected.length ? (selected.length === options.length ? `All (${selected.length})` : `${selected.length} selected`) : placeholder;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`flex items-center justify-between gap-1.5 truncate rounded-lg border border-line bg-white px-2 py-1 text-left text-[11px] text-ivory transition hover:border-[#005eed]/40 ${className}`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-mist transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && (
        <PortalPanel pos={pos} onClose={close}>
          <div className="sticky -top-2 z-10 -mx-2 -mt-2 mb-1 flex items-center justify-between gap-2 border-b border-line bg-white px-2 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-mist">
              {selected.length}/{options.length}
            </span>
            <div className="flex gap-2 text-[10px] font-medium">
              <button type="button" className="text-[#005eed] hover:underline disabled:cursor-default disabled:text-line disabled:no-underline" disabled={allOn} onClick={() => onChange(options.map((o) => o.value))}>
                Select all
              </button>
              <button type="button" className="text-mist hover:underline disabled:cursor-default disabled:text-line disabled:no-underline" disabled={!selected.length} onClick={() => onChange([])}>
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition ${on ? "bg-[#005eed]/[0.08]" : "hover:bg-ink"}`}>
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${on ? "bg-[#005eed] text-white" : "border border-line bg-white"}`}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <input type="checkbox" checked={on} onChange={() => toggleValue(o.value)} className="sr-only" />
                  <span className="truncate">{o.label}</span>
                </label>
              );
            })}
            {!options.length && <p className="px-2 py-1.5 text-xs text-mist">No options.</p>}
          </div>
        </PortalPanel>
      )}
    </>
  );
}

// Single-select dropdown, same portal mechanics as MultiSelect — use in place of a native
// <select> wherever it sits inside a scrolling/overflow-clipped container.
export function Dropdown({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
  className?: string;
}) {
  const { triggerRef, open, pos, toggle, close } = usePortalPanel<HTMLButtonElement>();
  const label = options.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <button ref={triggerRef} type="button" onClick={toggle} className={className}>
        {label}
      </button>
      {open && pos && (
        <PortalPanel pos={pos} onClose={close}>
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                close();
              }}
              className={`block w-full whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm hover:bg-ink ${o.value === value ? "font-semibold text-[#005eed]" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </PortalPanel>
      )}
    </>
  );
}

export function trainerWeekHours(all: Session[], trainerId: string) {
  return Number(trainerLoad(all).find((t) => t.id === trainerId)?.hours ?? 0);
}

export function topTrainersFor(all: Session[], locationId: string, day: number, time: string, className: string) {
  return TRAINERS.filter((t) => t.active && t.access[locationId]?.days.includes(day))
    .map((t) => {
      const hours = trainerWeekHours(all, t.id);
      const hist = slotHistory(locationId, day, time).find((h) => h.trainerId === t.id && h.name === className);
      return { trainer: t, hours, score: hist?.score ?? 40, fill: hist?.fill ?? 0, checkin: hist?.checkin ?? 0, sessions: hist?.sessions ?? 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
