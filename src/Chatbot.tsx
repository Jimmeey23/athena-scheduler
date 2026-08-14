import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { DAYS, FORMATS, LOCATIONS, TIMES, TRAINERS, resolveLocationId, trainerById } from "./data";
import type { Session, Settings } from "./types";
import { historicFor, scoreCombo } from "./engine";
import { recordOverride } from "./overrides";

type Msg = { role: "user" | "bot"; text: string };
type Pending = { next: Session[]; reply: string };

export function Chatbot({
  all,
  setAll,
  settings,
  locationId,
}: {
  all: Session[];
  setAll: (s: Session[]) => void;
  settings: Settings;
  locationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "I'll preview edits before they touch the live week. Examples: “add 3 classes at Kwality on Saturday”, “remove Sunday 18:15 Mat 57”, “swap Anisha with Reshma on Friday”.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  function diffSummary(next: Session[]) {
    const beforeIds = new Set(all.map((s) => s.id));
    const afterIds = new Set(next.map((s) => s.id));
    const added = next.filter((s) => !beforeIds.has(s.id)).length;
    const removed = all.filter((s) => !afterIds.has(s.id)).length;
    const changed = next.filter((s) => {
      const prev = all.find((p) => p.id === s.id);
      return prev && prev.trainerId !== s.trainerId;
    }).length;
    const parts = [added && `+${added} added`, removed && `-${removed} removed`, changed && `${changed} reassigned`].filter(Boolean);
    return parts.length ? parts.join(", ") : "no changes";
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    let applied = applyNaturalLanguage(text, all, settings, locationId);
    if (settings.ai.openaiKey) {
      try {
        const remote = await askOpenAIEdits(text, all, settings.ai.openaiKey, settings.ai.openaiModel);
        if (remote?.length) {
          applied = applyEditList(remote, applied.next, settings);
        }
      } catch {
        /* keep local result */
      }
    }
    setPending(applied);
    setMsgs((m) => [
      ...m,
      { role: "bot", text: `${applied.reply}\n\nPreview: ${diffSummary(applied.next)}. Apply this to the live week?` },
    ]);
    setBusy(false);
  }

  function confirmPending() {
    if (!pending) return;
    setAll(pending.next);
    setMsgs((m) => [...m, { role: "bot", text: "Applied to the live week." }]);
    setPending(null);
  }

  function discardPending() {
    setPending(null);
    setMsgs((m) => [...m, { role: "bot", text: "Discarded — the live week is unchanged." }]);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#005eed] text-white shadow-xl">
        <MessageCircle className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[480px] w-[min(400px,92vw)] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-medium">Athena assistant</p>
              <p className="text-[11px] text-mist">Previews edits before writing to the live calendar</p>
            </div>
            <button onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[92%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-[#005eed] text-white" : "bg-ink"}`}>
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-mist">Thinking…</p>}
            {pending && !busy && (
              <div className="flex gap-2">
                <button onClick={confirmPending} className="rounded-xl bg-[#005eed] px-3 py-1.5 text-sm text-white">
                  Apply
                </button>
                <button onClick={discardPending} className="rounded-xl border border-line px-3 py-1.5 text-sm">
                  Discard
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-line p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Add, remove, swap…" className="flex-1 rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none" />
            <button onClick={send} className="rounded-xl bg-[#005eed] px-3 text-white">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function findDay(text: string) {
  const map = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const i = map.findIndex((d) => text.includes(d) || text.includes(d.slice(0, 3)));
  return i >= 0 ? i : null;
}
function findTime(text: string) {
  const m = text.match(/\b(\d{1,2}):(\d{2})\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function findLoc(text: string) {
  return resolveLocationId(text, LOCATIONS);
}
function findTrainer(text: string) {
  return TRAINERS.find((t) => text.includes(t.name.toLowerCase()) || text.includes(t.name.split(" ")[0].toLowerCase()));
}
function findFormat(text: string) {
  return [...FORMATS].sort((a, b) => b.name.length - a.name.length).find((f) => text.includes(f.name.toLowerCase()));
}

function buildSession(house: string, day: number, time: string, format: (typeof FORMATS)[number], trainer: (typeof TRAINERS)[number], settings: Settings): Session {
  const h = historicFor(house, day, time, format.name, trainer.id);
  const sc = scoreCombo(h, trainer, settings, format.name);
  return {
    id: `${house}-${day}-${time}-${format.name}-${trainer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    locationId: house,
    day,
    time,
    name: format.name,
    studio: house === "supreme" && format.family === "cycle" ? "Studio 2" : format.studio,
    duration: format.duration,
    trainerId: trainer.id,
    score: sc.score,
    fill: h.fill,
    avg: h.checkin,
    sessions: h.sessions,
    oneOff: sc.oneOff,
    reason: `Live chat add. ${trainer.name} is certified for ${format.name}.`,
    breakdown: sc.breakdown,
    capacity: format.family === "cycle" ? 24 : 18,
    tags: ["new"],
    accent: format.accent,
  };
}

export function applyNaturalLanguage(raw: string, all: Session[], settings: Settings, fallbackLoc: string) {
  const text = raw.toLowerCase();
  const day = findDay(text);
  const time = findTime(text);
  const loc = findLoc(text) || fallbackLoc;
  const trainer = findTrainer(text);
  const format = findFormat(text);
  let next = [...all];

  const match = (s: Session) =>
    (day == null || s.day === day) &&
    (!time || s.time === time) &&
    (!loc || s.locationId === loc) &&
    (!format || s.name.toLowerCase() === format.name.toLowerCase()) &&
    (!trainer || s.trainerId === trainer.id);

  if (/(remove|delete|drop|cancel)/.test(text)) {
    const before = next.length;
    next = next.filter((s) => !match(s));
    return { next, reply: `Removed ${before - next.length} live class${before - next.length === 1 ? "" : "es"}. Refresh the ${DAYS[day ?? 0].full} column if you are filtered to another house.` };
  }

  if (/(swap|replace|substitute|sub |cover)/.test(text)) {
    const names = TRAINERS.filter((t) => text.includes(t.name.split(" ")[0].toLowerCase()));
    const from = names[0];
    const to = names[1];
    if (from && to) {
      let n = 0;
      next = next.map((s) => {
        if (s.trainerId === from.id && match({ ...s, trainerId: from.id })) {
          n += 1;
          recordOverride(s.locationId, s.day, s.time, s.name, from.id, to.id);
          return { ...s, trainerId: to.id, reason: `Chat swap: ${from.name} → ${to.name}` };
        }
        return s;
      });
      return { next, reply: `Swapped ${from.name} → ${to.name} on ${n} live slot${n === 1 ? "" : "s"}.` };
    }
  }

  if (/(add|more class|few more|schedule|insert|put)/.test(text)) {
    const house = loc;
    const d = day ?? 5;
    const countMatch = text.match(/\b(\d+)\b/);
    const want = Math.min(6, Math.max(format && time ? 1 : Number(countMatch?.[1] || 3), 1));
    const used = new Set(next.filter((s) => s.locationId === house && s.day === d).map((s) => `${s.time}|${s.studio}`));
    const added: Session[] = [];
    const times = time ? [time] : TIMES.filter((t) => !next.some((s) => s.locationId === house && s.day === d && s.time === t));
    const formats = format ? [format] : FORMATS.filter((f) => !/hosted|foundation|sweat/i.test(f.name));
    const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
    for (const t of times) {
      if (added.length >= want) break;
      const f = formats[(added.length + d) % formats.length];
      const who =
        trainer ||
        roster.find((tr) => tr.active && tr.certs[f.cert] && tr.access[house]?.days.includes(d) && !tr.access[house]?.weekOff.includes(d));
      if (!who) continue;
      const room = house === "supreme" && f.family === "cycle" ? "Studio 2" : f.studio;
      if (used.has(`${t}|${room}`)) continue;
      const s = buildSession(house, d, t, f, who, settings);
      s.studio = room;
      next.push(s);
      added.push(s);
      used.add(`${t}|${room}`);
    }
    if (!added.length) return { next, reply: `Could not add classes — no free Saturday/selected slots or eligible trainers at ${house}.` };
    const lines = added.map((s) => `• ${DAYS[s.day].label} ${s.time} ${s.name} — ${trainerById(s.trainerId).name} (${s.studio})`).join("\n");
    return {
      next,
      reply: `Added ${added.length} live class${added.length === 1 ? "" : "es"} at ${LOCATIONS.find((l) => l.id === house)?.name}. They are on the calendar now:\n${lines}`,
    };
  }

  return { next, reply: "I need a house and a day, e.g. “add 3 classes at Kwality on Saturday” or “remove Friday 19:00 FIT”." };
}

type RemoteEdit = { action: "add" | "remove" | "swap"; location?: string; day?: string; time?: string; className?: string; trainer?: string; newTrainer?: string };

function applyEditList(edits: RemoteEdit[], all: Session[], settings: Settings) {
  let next = [...all];
  const notes: string[] = [];
  for (const e of edits) {
    const loc = findLoc((e.location || "").toLowerCase()) || "kwality";
    const day = findDay((e.day || "").toLowerCase());
    const time = e.time ? findTime(e.time) : null;
    if (e.action === "remove" && day != null) {
      const before = next.length;
      next = next.filter((s) => !(s.locationId === loc && s.day === day && (!time || s.time === time)));
      notes.push(`removed ${before - next.length}`);
    }
    if (e.action === "add" && day != null && time) {
      const format = FORMATS.find((f) => f.name.toLowerCase() === (e.className || "").toLowerCase()) || FORMATS[0];
      const who = TRAINERS.find((t) => t.name.toLowerCase() === (e.trainer || "").toLowerCase()) || TRAINERS[0];
      next.push(buildSession(loc, day, time, format, who, settings));
      notes.push(`added ${format.name}`);
    }
  }
  return { next, reply: notes.length ? `Applied ${notes.length} live edit(s): ${notes.join(", ")}.` : "No structured edits returned." };
}

async function askOpenAIEdits(prompt: string, all: Session[], key: string, model: string): Promise<RemoteEdit[] | null> {
  const snap = all.slice(0, 80).map((s) => `${DAYS[s.day].full} ${s.time} ${s.locationId} ${s.name} ${trainerById(s.trainerId).name}`).join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            'Return ONLY JSON: {"edits":[{"action":"add|remove|swap","location":"kwality","day":"Saturday","time":"10:15","className":"Barre 57","trainer":"Anisha Shah"}]}. Use existing class names. Never invent Hosted, Foundations, or SWEAT In 30.',
        },
        { role: "user", content: `LIVE WEEK:\n${snap}\n\nINSTRUCTION: ${prompt}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  return parsed.edits || null;
}
