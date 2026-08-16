import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { getClient } from "./supabase";

export type Profile = {
  id: string;
  email: string;
  role: "admin" | "branch";
  locations: string[];
};

type AuthState = {
  session: SupabaseSession | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
};

const AuthContext = createContext<AuthState>({ session: null, profile: null, loading: true, authError: null });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true, authError: null });

  useEffect(() => {
    const client = getClient();
    if (!client) {
      setState({ session: null, profile: null, loading: false, authError: "Supabase is not configured — check your .env." });
      return;
    }
    let cancelled = false;

    async function loadProfile(session: SupabaseSession) {
      const { data, error } = await client!
        .from("athena_profiles")
        .select("id, email, role, locations")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      // A missing/errored profile means the signup trigger rejected this email (unrecognized
      // domain) after the OAuth redirect already created a session — never leave that half-logged-in.
      if (error || !data) {
        await client!.auth.signOut();
        if (!cancelled) {
          setState({ session: null, profile: null, loading: false, authError: "This email isn't authorized for Athena Scheduler." });
        }
        return;
      }
      setState({ session, profile: data as Profile, loading: false, authError: null });
    }

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) loadProfile(data.session);
      else setState((s) => ({ ...s, loading: false }));
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (session) loadProfile(session);
      else setState({ session: null, profile: null, loading: false, authError: null });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
