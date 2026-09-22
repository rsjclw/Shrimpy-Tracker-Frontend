"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordInput } from "@/components/auth/AuthPasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTextInput } from "@/components/auth/AuthTextInput";
import { COPY, EMAIL_RE, EYEBROW } from "@/components/auth/copy";
import { useLang } from "@/components/auth/useLang";
import { Button } from "@/components/ui/Button";
import { Banner, Spinner } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { getToken, setSession } from "@/lib/auth";

type View = "signin" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const t = COPY[lang];

  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  // Already signed in: no point showing the form.
  useEffect(() => {
    if (getToken()) router.replace("/");
  }, [router]);

  const trimmedEmail = email.trim();
  const fieldErrors = {
    email: !trimmedEmail ? t.errEmailEmpty : !EMAIL_RE.test(trimmedEmail) ? t.errEmailBad : "",
    password: !password ? t.errPwEmpty : "",
  };
  const showEmailError = touched && !!fieldErrors.email;
  const showPasswordError = touched && !!fieldErrors.password;

  async function submit() {
    if (fieldErrors.email || fieldErrors.password) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const { access_token, user } = await api.login(trimmedEmail, password);
      setSession(access_token, user);
      router.replace(user.must_change_password ? "/change-password" : "/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const mapped =
        message === "Invalid email or password"
          ? t.errWrong
          : message.startsWith("Too many failed sign-in attempts")
            ? t.errLocked
            : message || t.errWrong;
      setFormError(mapped);
      setTouched(true);
      setBusy(false);
    }
  }

  function goForgot() {
    setView("forgot");
    setTouched(false);
    setFormError("");
  }
  function goSignin() {
    setView("signin");
    setTouched(false);
    setFormError("");
  }

  return (
    <AuthShell
      lang={lang}
      onLangChange={setLang}
      eyebrow={EYEBROW}
      title={view === "forgot" ? t.resetTitle : t.title}
      subtitle={view === "forgot" ? t.resetSubtitle : t.subtitle}
      footer={
        <>
          <Banner tone="info">
            <span className="flex items-start gap-2.5">
              <Icon name="mail" size={16} className="mt-0.5 shrink-0 text-tx-muted" />
              <span>{t.invite}</span>
            </span>
          </Banner>
          <span className="font-mono text-[11px] text-tx-faint">v1.0</span>
        </>
      }
    >
      {view === "signin" ? (
        <form
          className="relative mt-9 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {formError ? (
            <Banner tone="bad">
              <span className="flex items-start gap-2.5">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </span>
            </Banner>
          ) : null}

          <AuthTextInput
            id="login-email"
            label={t.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nama@tambak.id"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            error={showEmailError ? fieldErrors.email : undefined}
            invalid={showEmailError || !!formError}
          />

          <AuthPasswordInput
            id="login-password"
            label={t.password}
            value={password}
            onChange={(v) => {
              setPassword(v);
              setFormError("");
            }}
            onEnter={submit}
            autoComplete="current-password"
            error={showPasswordError ? fieldErrors.password : undefined}
            invalid={showPasswordError || !!formError}
            showLabel={t.showPassword}
            hideLabel={t.hidePassword}
            labelRight={
              <button
                type="button"
                onClick={goForgot}
                className="py-1 text-xs font-bold text-accent hover:text-accent-hover"
              >
                {t.forgot}
              </button>
            }
          />

          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {busy ? <Spinner size={18} className="text-accent-ink" /> : null}
            {busy ? t.signingIn : t.signIn}
          </Button>
        </form>
      ) : (
        <div className="relative mt-9 flex flex-col gap-4">
          <div className="flex justify-center pt-2">
            <Button variant="ghost" size="md" onClick={goSignin}>
              {t.back}
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
