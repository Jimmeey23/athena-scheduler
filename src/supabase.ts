import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Session, GenReport } from "./types";
import type { Draft } from "./drafts";

const url = ((import.meta as unknown as { env?: Record<string, string> }).env || {}).VITE_SUPABASE_URL || "";
const key = ((import.meta as unknown as { env?: Record<string, string> }).env || {}).VITE_SUPABASE_ANON_KEY || "";

let client: SupabaseClient | null = null;
if (url && key) {
  try {
    client = createClient(url, key);
  } catch {
    client = null;
  }
}

export function hasSupabase() {
  return Boolean(client);
}

export async function persistCloud(payload: { settings?: unknown; drafts?: Draft[]; sessions?: Session[] }) {
  if (!client) return;
  try {
    await client.from("athena_state").upsert({ id: "main", ...payload, updated_at: new Date().toISOString() });
  } catch {
    /* local fallback remains */
  }
}

export async function loadCloud(): Promise<{ settings?: unknown; drafts?: Draft[]; sessions?: Session[] } | null> {
  if (!client) return null;
  try {
    const { data } = await client.from("athena_state").select("*").eq("id", "main").maybeSingle();
    return data as { settings?: unknown; drafts?: Draft[]; sessions?: Session[] } | null;
  } catch {
    return null;
  }
}

export type CloudSchedule = { sessions: Session[]; report: GenReport };

// The most recently generated schedule, shared across devices via Supabase — source of truth on load.
export async function persistSchedule(bundle: CloudSchedule) {
  if (!client) return;
  try {
    await client.from("athena_state").upsert({
      id: "main",
      schedule_sessions: bundle.sessions,
      schedule_report: bundle.report,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* local storage cache remains authoritative for this device */
  }
}

export async function loadSchedule(): Promise<CloudSchedule | null> {
  if (!client) return null;
  try {
    const { data } = await client.from("athena_state").select("schedule_sessions, schedule_report").eq("id", "main").maybeSingle();
    if (!data?.schedule_sessions || !data?.schedule_report) return null;
    return { sessions: data.schedule_sessions as Session[], report: data.schedule_report as GenReport };
  } catch {
    return null;
  }
}
