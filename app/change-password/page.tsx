"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPasswordInput } from "@/components/auth/AuthPasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";
import { COPY, EYEBROW, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/components/auth/copy";
import { useLang } from "@/components/auth/useLang";
import { Button } from "@/components/ui/Button";
import { Banner, Loading, Spinner } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { updateStoredUser } from "@/lib/auth";
import { signOut, useRequireUser } from "@/lib/session";

export default function ChangePasswordPage() {
  const user = useRequireUser({ allowPasswordChange: true });
  const router = useRouter();
  const [lang, setLang] = useLang();
  const t = COPY[lang];

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  if (!user) return <Loading />;

  // Mirrors the backend's ChangePasswordRequest validation exactly (required
  // current password, new password >= PASSWORD_MIN_LENGTH) plus a
  // client-only confirm-matches check.
  const fieldErrors = {
    current: !current ? t.errCurrentEmpty : "",
    next: !next ? t.errNewEmpty : next.length < PASSWORD_MIN_LENGTH ? t.errNewShort : "",
    confirm: !confirm ? t.errConfirmEmpty : confirm !== next ? t.errConfirmMismatch : "",
  };
  const hasFieldError = !!(fieldErrors.current || fieldErrors.next || fieldErrors.confirm);

  async function submit() {
    if (hasFieldError) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const updated = await api.changePassword(current, next);
      updateStoredUser(updated);
      router.replace("/");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.updatePassword);
      setTouched(true);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      lang={lang}
      onLangChange={setLang}
      eyebrow={EYEBROW}
      title={t.cpTitle}
      subtitle={t.cpSubtitle}
      footer={
        <>
          {!user.must_change_password ? (
            <Button variant="ghost" size="md" onClick={() => router.push("/")}>
              {t.backToDashboard}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="py-1 text-xs font-semibold text-tx-muted hover:text-tx-soft"
          >
            {t.signOut}
          </button>
        </>
      }
    >
      <form
        className="relative mt-9 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {user.must_change_password ? (
          <Banner tone="warn">
            <span className="flex items-start gap-2.5">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>{t.cpTempNotice}</span>
            </span>
          </Banner>
        ) : null}

        {formError ? (
          <Banner tone="bad">
            <span className="flex items-start gap-2.5">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </span>
          </Banner>
        ) : null}

        <AuthPasswordInput
          id="cp-current"
          label={t.currentPassword}
          value={current}
          onChange={(v) => {
            setCurrent(v);
            setFormError("");
          }}
          onEnter={submit}
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          error={touched && fieldErrors.current ? fieldErrors.current : undefined}
          invalid={(touched && !!fieldErrors.current) || !!formError}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
        />

        <AuthPasswordInput
          id="cp-new"
          label={t.newPassword}
          value={next}
          onChange={(v) => {
            setNext(v);
            setFormError("");
          }}
          onEnter={submit}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          error={touched && fieldErrors.next ? fieldErrors.next : undefined}
          invalid={touched && !!fieldErrors.next}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
        />

        <AuthPasswordInput
          id="cp-confirm"
          label={t.confirmPassword}
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setFormError("");
          }}
          onEnter={submit}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          error={touched && fieldErrors.confirm ? fieldErrors.confirm : undefined}
          invalid={touched && !!fieldErrors.confirm}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
        />

        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? <Spinner size={18} className="text-accent-ink" /> : null}
          {busy ? t.updatingPassword : t.updatePassword}
        </Button>
      </form>
    </AuthShell>
  );
}
