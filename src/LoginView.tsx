import { useState } from "react";
import { signInWithGoogle, signInWithPassword, signUpWithPassword } from "./auth";

export function LoginView({ initialError }: { initialError: string | null }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = mode === "login" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (mode === "signup") setNotice("Account created — check your inbox to confirm your email, then sign in.");
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <p className="font-serif text-[28px] leading-none tracking-tight text-ivory">
            Athena <span className="italic text-gold">Ai</span>
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-mist">Smart schedules. Stronger studios.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-[10px] uppercase tracking-[0.16em] text-mist">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-[#efefef] px-3 py-2 text-sm text-ivory outline-none focus:border-[#005eed]"
              placeholder="you@physique57mumbai.com"
            />
          </label>
          <label className="block text-[10px] uppercase tracking-[0.16em] text-mist">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-[#efefef] px-3 py-2 text-sm text-ivory outline-none focus:border-[#005eed]"
              placeholder="••••••••"
            />
          </label>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          {notice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#0e1729] py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white py-2.5 text-sm text-ivory hover:bg-ink disabled:opacity-60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.66z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3a7.4 7.4 0 0 1-4.05 1.14c-3.11 0-5.75-2.1-6.69-4.93H1.3v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.31 14.31A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.38-2.31V6.59H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.4z" />
            <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.59l4.01 3.1C6.25 6.86 8.89 4.75 12 4.75z" />
          </svg>
          Sign in with Google
        </button>

        <p className="mt-5 text-center text-xs text-mist">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "signup" : "login"));
              setError(null);
              setNotice(null);
            }}
            className="font-medium text-[#005eed]"
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="mt-3 text-center text-[10px] text-mist">
          Access is limited to Physique 57 India studio emails.
        </p>
      </div>
    </div>
  );
}
