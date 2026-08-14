import { useState, type ReactNode } from "react";
import { Copy, Search, Trash2, UserRound } from "lucide-react";
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
        {score}
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
  if (compact) {
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/session-id", session.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`ticket group relative w-full cursor-grab overflow-hidden rounded-xl p-2 text-left transition ${dimmed ? "opacity-30" : ""} ${
          session.tags.includes("violation") ? "ring-1 ring-red-300" : "ring-1 ring-line hover:ring-[#005eed]/40"
        }`}
      >
        <button className="w-full text-left" onClick={() => actions.onSelect(session)}>
          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full" style={{ background: session.accent }} />
          <p className="truncate pl-1.5 text-[11px] font-medium leading-tight text-ivory">{session.name}</p>
          <div className="mt-1 flex items-center gap-1 pl-1.5">
            <img src={trainer.photo} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-line" />
            <span className="min-w-0 flex-1 truncate text-[9px] text-ivory/70">{trainer.name.split(" ")[0]}</span>
            <span className="shrink-0 text-[9px] font-medium tabular-nums text-mist">{session.fill}%</span>
          </div>
        </button>
        <div className="pointer-events-none absolute inset-x-1 top-1 flex justify-end opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
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
          <span className="rounded-full bg-ink px-1.5 py-0.5">{session.fill}%</span>
          {session.oneOff && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700">One-off</span>}
          {pinned && <span className="rounded-full bg-[#005eed]/10 px-1.5 py-0.5 text-[#005eed]">Pinned</span>}
        </div>
        <div className="mt-2 pl-1.5">
          <FillBar fill={session.fill} />
          <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-mist">
            <span>Fill {session.fill}%</span>
            <span>Avg {session.avg.toFixed(1)}</span>
          </div>
        </div>
      </button>
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-end gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
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
