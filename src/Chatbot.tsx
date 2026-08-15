import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { DAYS, FORMATS, LOCATIONS, TIMES, TRAINERS, resolveLocationId, trainerById } from "./data";
import type { Session, Settings } from "./types";
import { historicFor, scoreCombo } from "./engine";
import { recordOverride } from "./overrides";

type Msg = { role: "user" | "bot"; text: string };
type Pending = { next: Session[]; reply: string };
type AiReply = { reply: string; edits: RemoteEdit[] };

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
    if (settings.ai.openaiKey) {
      try {
        const remote = await askOpenAI(text, msgs, all, settings);
        if (remote.edits.length) {
          const applied = applyEditList(remote.edits, all, settings, locationId);
          setPending(applied);
          setMsgs((m) => [
            ...m,
            { role: "bot", text: `${remote.reply}\n\n${applied.reply}\n\nPreview: ${diffSummary(applied.next)}. Apply this to the live week?` },
          ]);
        } else {
          setPending(null);
          setMsgs((m) => [...m, { role: "bot", text: remote.reply }]);
        }
        setBusy(false);
        return;
      } catch (err) {
        const fallback = applyNaturalLanguage(text, all, settings, locationId);
        const changed = diffSummary(fallback.next) !== "no changes";
        if (changed) {
          setPending(fallback);
          setMsgs((m) => [...m, { role: "bot", text: `${fallback.reply}\n\nPreview: ${diffSummary(fallback.next)}. Apply this to the live week?` }]);
        } else {
          setPending(null);
          setMsgs((m) => [...m, { role: "bot", text: `I could not reach OpenAI for a full answer. ${fallback.reply}` }]);
        }
        setBusy(false);
        return;
      }
    }

    const applied = applyNaturalLanguage(text, all, settings, locationId);
    const changed = diffSummary(applied.next) !== "no changes";
    if (changed) {
      setPending(applied);
      setMsgs((m) => [...m, { role: "bot", text: `${applied.reply}\n\nPreview: ${diffSummary(applied.next)}. Apply this to the live week?` }]);
    } else {
      setPending(null);
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text: "OpenAI is not configured for this app session, so I can only use the local schedule-edit parser. Add `VITE_OPENAI_API_KEY` to enable full general Q&A and richer schedule instructions.",
        },
      ]);
    }
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
              <p className="text-[11px] text-mist">OpenAI answers questions and previews calendar edits</p>
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
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask anything, or edit the schedule…" className="flex-1 rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none" />
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

type RemoteEdit = {
  action: "add" | "create" | "remove" | "delete" | "swap" | "reschedule" | "modify";
  location?: string;
  day?: string;
  time?: string;
  className?: string;
  trainer?: string;
  newTrainer?: string;
  newDay?: string;
  newTime?: string;
  newLocation?: string;
  newClassName?: string;
};

function applyEditList(edits: RemoteEdit[], all: Session[], settings: Settings, fallbackLoc: string) {
  let next = [...all];
  const notes: string[] = [];
  for (const e of edits) {
    const loc = findLoc((e.location || "").toLowerCase()) || fallbackLoc;
    const day = findDay((e.day || "").toLowerCase());
    const time = e.time ? findTime(e.time) : null;
    const format = findFormat((e.className || "").toLowerCase());
    const trainer = findTrainer((e.trainer || "").toLowerCase());
    const matches = (s: Session) =>
      s.locationId === loc &&
      (day == null || s.day === day) &&
      (!time || s.time === time) &&
      (!format || s.name === format.name) &&
      (!trainer || s.trainerId === trainer.id);

    if ((e.action === "remove" || e.action === "delete") && (day != null || time || format || trainer)) {
      const before = next.length;
      next = next.filter((s) => !matches(s));
      notes.push(`removed ${before - next.length}`);
    }
    if ((e.action === "add" || e.action === "create") && day != null && time) {
      const format = findFormat((e.className || "").toLowerCase()) || FORMATS[0];
      const who = findTrainer((e.trainer || "").toLowerCase()) || eligibleTrainer(format, loc, day, settings);
      if (!who) {
        notes.push(`could not add ${format.name}: no eligible trainer`);
        continue;
      }
      next.push(buildSession(loc, day, time, format, who, settings));
      notes.push(`added ${format.name} on ${DAYS[day].label} ${time}`);
    }
    if (e.action === "swap") {
      const to = findTrainer((e.newTrainer || "").toLowerCase());
      if (!to) {
        notes.push("could not swap: new trainer not found");
        continue;
      }
      let n = 0;
      next = next.map((s) => {
        if (!matches(s)) return s;
        n += 1;
        recordOverride(s.locationId, s.day, s.time, s.name, s.trainerId, to.id);
        return { ...s, trainerId: to.id, reason: `Chat swap: ${trainerById(s.trainerId).name} → ${to.name}` };
      });
      notes.push(`swapped trainer on ${n} slot${n === 1 ? "" : "s"}`);
    }
    if (e.action === "reschedule" || e.action === "modify") {
      const newDay = e.newDay ? findDay(e.newDay.toLowerCase()) : null;
      const newTime = e.newTime ? findTime(e.newTime) : null;
      const newLoc = e.newLocation ? findLoc(e.newLocation.toLowerCase()) : null;
      const newFormat = e.newClassName ? findFormat(e.newClassName.toLowerCase()) : null;
      const newTrainer = e.newTrainer ? findTrainer(e.newTrainer.toLowerCase()) : null;
      let n = 0;
      next = next.map((s) => {
        if (!matches(s)) return s;
        n += 1;
        const format = newFormat || FORMATS.find((f) => f.name === s.name) || FORMATS[0];
        const trainer = newTrainer || trainerById(s.trainerId);
        const moved = buildSession(newLoc || s.locationId, newDay ?? s.day, newTime || s.time, format, trainer, settings);
        return { ...moved, id: s.id, pinned: s.pinned, reason: "Chat reschedule/edit preview." };
      });
      notes.push(`updated ${n} slot${n === 1 ? "" : "s"}`);
    }
  }
  return { next, reply: notes.length ? `Prepared ${notes.length} edit step(s): ${notes.join(", ")}.` : "No structured edits were actionable." };
}

function eligibleTrainer(format: (typeof FORMATS)[number], loc: string, day: number, settings: Settings) {
  const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
  return roster.find((t) => t.active && t.certs[format.cert] && t.access[loc]?.days.includes(day) && !t.access[loc]?.weekOff.includes(day));
}

async function askOpenAI(prompt: string, history: Msg[], all: Session[], settings: Settings): Promise<AiReply> {
  const snap = all
    .slice(0, 220)
    .map((s) => `${s.id} | ${DAYS[s.day].full} ${s.time} | ${s.locationId} | ${s.studio} | ${s.name} | ${trainerById(s.trainerId).name} | avg ${s.avg} | fill ${s.fill}% | sessions ${s.sessions}`)
    .join("\n");
  const key = settings.ai.openaiKey;
  const model = settings.ai.openaiModel || "gpt-4.1-mini";
  const recent = history.slice(-8).map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }));
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are Athena, an OpenAI-powered assistant inside a scheduling app. Answer any question the user asks, including questions outside Physique 57, in a clear, accurate, detailed, well-written manner. If current real-world facts may have changed, say you may need live verification because this app chat has no browser access.

For schedule edits, return JSON only with:
{"reply":"well-written user-facing answer","edits":[...]}

Supported edit actions:
- add/create: location, day, time, className, optional trainer
- remove/delete: identify by location/day/time/className/trainer as available
- swap: identify slot(s) with location/day/time/className/trainer and provide newTrainer
- reschedule/modify: identify slot(s), then provide newDay/newTime/newLocation/newClassName/newTrainer as needed

Use only these location ids/names: ${LOCATIONS.map((l) => `${l.id} (${l.name})`).join(", ")}.
Use only these class names: ${FORMATS.map((f) => f.name).join(", ")}.
Use only these trainers: ${TRAINERS.map((t) => t.name).join(", ")}.
Never create Hosted, Foundations, or SWEAT In 30.
If the user asks a question only, return edits: [].
If an edit is ambiguous, ask a clarifying question in reply and return edits: [].
Do not say an edit is applied; say it is prepared for preview.`,
        },
        ...recent,
        { role: "user", content: `LIVE WEEK SNAPSHOT:\n${snap}\n\nUSER REQUEST:\n${prompt}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(raw);
  return {
    reply: String(parsed.reply || "I can help with that."),
    edits: Array.isArray(parsed.edits) ? parsed.edits : [],
  };
}
