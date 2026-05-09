"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authRedirectUrl } from "@/lib/authRedirect";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === "forgot") {
      setLoading(true);
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl("/reset-password"),
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setMessage("Password reset email sent. Check your inbox.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const sb = getSupabase();
    const { error } =
      mode === "signin"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: authRedirectUrl("/"),
            },
          });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  }

  function toggleMode() {
    setMode((current) => (current === "signup" ? "signin" : "signup"));
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  }

  function switchToForgot() {
    setMode("forgot");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  }

  function switchToSignin() {
    setMode("signin");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
        </h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
          required
        />
        {mode !== "forgot" && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
            minLength={6}
          />
        )}
        {mode === "signup" && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
            minLength={6}
          />
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {message && <p className="text-green-700 text-sm">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white rounded py-2 disabled:opacity-50"
        >
          {loading ? "..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset email"}
        </button>
        <div className="space-y-2">
          {mode === "signin" && (
            <button
              type="button"
              onClick={switchToForgot}
              className="w-full text-sm text-slate-600 hover:underline"
            >
              Forgot password?
            </button>
          )}
          <button
            type="button"
            onClick={mode === "forgot" ? switchToSignin : toggleMode}
            className="w-full text-sm text-slate-600 hover:underline"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}
