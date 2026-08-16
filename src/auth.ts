import { getClient } from "./supabase";

export async function signUpWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  const client = getClient();
  if (!client) return { error: "Supabase is not configured." };
  const { error } = await client.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

export async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  const client = getClient();
  if (!client) return { error: "Supabase is not configured." };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const client = getClient();
  if (!client) return { error: "Supabase is not configured." };
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.auth.signOut();
}
