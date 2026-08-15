import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, Pin, PinOff, Search, Trash2, UserRound } from "lucide-react";
import { DAYS, TAG_META, TRAINERS, trainerById, trainerLoad } from "./data";
import { slotHistory } from "./engine";
import type { Session, Tag } from "./types";

export function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#16a34a" : score >= 65 ? "#005eed" : "#e05a3c";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(14,23,41,0.1)" strokeWidth="2.5" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#0e1729" fontSize={size < 34 ? 8 : 10} fontWeight="600" fontFamily="Outfit, sans-serif">
        {score > 0 ? score : "—"}
      </text>
    </svg>
  );
}

export function TagChip({ tag }: { tag: Tag }) {
  const meta = TAG_META[tag];
  return <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide ring-1 ring-inset ${meta.cls}`}>{meta.label}</span>;
}

export function FillBar({ fill }: { fill: number }) {
  const color = fill >= 70 ? "#005eed" : fill >= 40 ? "#0e1729" : "#e05a3c";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-mist">{fill}%</span>
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

export function ClassCard({
  session,
  dimmed,
  pinned,
  weekHours,
  actions,
  compact,
}: {
  session: Session;
  dimmed?: boolean;
  pinned?: boolean;
  weekHours?: number;
  actions: CardActions;
  compact?: boolean;
}) {
  const trainer = trainerById(session.trainerId);
  const hasSheetHistory = session.sessions > 0;
  if (compact) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/session-id", session.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`ticket group relative w-full cursor-grab overflow-hidden rounded-xl p-2 text-left transition hover:shadow-lg ${dimmed ? "opacity-30" : ""} ${
          session.tags.includes("violation") ? "ring-1 ring-red-300" : "ring-1 ring-line hover:ring-[#005eed]/40"
        }`}
      >
        <button className="w-full text-left" onClick={() => actions.onSelect(session)}>
          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full" style={{ background: session.accent }} />
          <div className="flex items-start justify-between gap-1 pl-1.5">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium leading-tight text-ivory">{session.name}</p>
              <p className="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-mist">{session.studio}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#0e1729] ring-1 ring-line">{session.score || "—"}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 pl-1.5">
            <img src={trainer.photo} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-line" />
            <span className="min-w-0 flex-1 truncate text-[9px] text-ivory/70">{trainer.name.split(" ")[0]}</span>
            <span className="shrink-0 text-[9px] tabular-nums text-mist">{session.time}</span>
          </div>
          <div className="max-h-0 overflow-hidden pl-1.5 opacity-0 transition-all duration-200 group-hover:max-h-40 group-hover:pt-2 group-hover:opacity-100">
            {hasSheetHistory ? (
              <>
                <FillBar fill={session.fill} />
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <MetricPill label="Avg" value={session.avg.toFixed(1)} />
                  <MetricPill label="Fill" value={`${session.fill}%`} />
                  <MetricPill label="Sessions" value={String(session.sessions)} />
                  <MetricPill label="Checked In" value={String(Math.round(session.avg * session.sessions))} />
                </div>
              </>
            ) : (
              <p className="text-[9px] uppercase tracking-wider text-mist">No matching history</p>
            )}
            <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-mist">
              <span className="rounded-full bg-ink px-1.5 py-0.5">{weekHours ?? 0}h</span>
              <span className="rounded-full bg-ink px-1.5 py-0.5">{hasSheetHistory ? `${session.fill}%` : "—"}</span>
              {session.oneOff && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700">One-off</span>}
              {pinned && <span className="rounded-full bg-[#005eed]/10 px-1.5 py-0.5 text-[#005eed]">Pinned</span>}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between pl-1.5 group-hover:hidden">
            <span className="text-[9px] text-mist">{hasSheetHistory ? `${session.fill}% fill` : "No hist"}</span>
            <span className="shrink-0 text-[9px] font-medium tabular-nums text-mist">{hasSheetHistory ? `${session.sessions} runs` : "—"}</span>
          </div>
        </button>
        <div className="pointer-events-none absolute inset-x-1 top-1 z-10 flex justify-end gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
          <IconBtn title={pinned ? "Unpin class" : "Pin class"} onClick={() => actions.onTogglePin?.(session)}>
            {pinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
          </IconBtn>
          <IconBtn title="Change trainer" onClick={() => actions.onSwap?.(session)}>
            <UserRound className="h-2.5 w-2.5" />
          </IconBtn>
          <IconBtn title="Find similar" onClick={() => actions.onSimilar?.(session)}>
            <Search className="h-2.5 w-2.5" />
          </IconBtn>
          <IconBtn title="Remove class" onClick={() => actions.onRemove?.(session)}>
            <Trash2 className="h-2.5 w-2.5" />
          </IconBtn>
        </div>
      </div>
    );
  }
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/session-id", session.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`ticket group relative w-full cursor-grab rounded-2xl p-3 text-left transition ${dimmed ? "opacity-30" : ""} ${
        session.tags.includes("violation") ? "ring-1 ring-red-300" : "ring-1 ring-line hover:ring-[#005eed]/40"
      }`}
    >
      <button className="w-full text-left" onClick={() => actions.onSelect(session)}>
        <span className="absolute inset-y-3 left-0 w-0.5 rounded-full" style={{ background: session.accent }} />
        <div className="flex items-start justify-between gap-2 pl-1.5">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-mist">{session.studio}</p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-ivory">{session.name}</p>
          </div>
          <ScoreRing score={session.score} />
        </div>
        <div className="mt-2.5 flex items-center gap-2 pl-1.5">
          <img src={trainer.photo} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-line" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-ivory/80">{trainer.name}</span>
          <span className="text-[10px] tabular-nums text-mist">{session.time}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 pl-1.5 text-[10px] text-mist">
          <span className="rounded-full bg-ink px-1.5 py-0.5">{weekHours ?? 0}h</span>
          <span className="rounded-full bg-ink px-1.5 py-0.5">{hasSheetHistory ? `${session.fill}%` : "No sheet hist"}</span>
          {session.oneOff && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700">One-off</span>}
          {pinned && <span className="rounded-full bg-[#005eed]/10 px-1.5 py-0.5 text-[#005eed]">Pinned</span>}
        </div>
        <div className="mt-2 pl-1.5">
          {hasSheetHistory ? (
            <>
              <FillBar fill={session.fill} />
              <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-mist">
                <span>Fill {session.fill}%</span>
                <span>Avg {session.avg.toFixed(1)}</span>
              </div>
            </>
          ) : (
            <p className="text-[9px] uppercase tracking-wider text-mist">No matching history</p>
          )}
        </div>
      </button>
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-end gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
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
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-white px-2 py-1 ring-1 ring-[#005eed]/15">
      <span className="block text-[7px] font-semibold uppercase tracking-[0.12em] text-mist">{label}</span>
      <span className="block text-[10px] font-semibold tabular-nums text-[#005eed]">{value}</span>
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
      className="rounded-lg bg-white p-1.5 text-[#0e1729] shadow ring-1 ring-line hover:bg-[#005eed] hover:text-white"
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
          <p className="text-[9px] uppercase tracking-wider text-mist">Historic {DAYS[day].label} {time}</p>
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
                <span className="font-medium">{h.name}</span> · {t.name.split(" ")[0]} · {h.checkin} avg · {h.fill}% fill · {h.sessions} classes
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
