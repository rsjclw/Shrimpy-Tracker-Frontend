// Shared EN/ID copy for the sign-in and change-password screens. Kept in one
// module so both pages read identical strings for the language the user has
// picked (persisted under localStorage key `shrimpy.lang`, see useLang.ts).

export type Lang = "en" | "id";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the backend's ChangePasswordRequest schema
// (app/schemas/auth.py: PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

// Brand eyebrow above the title. The mockup does not localise it.
export const EYEBROW = "Pond Monitoring";

type Copy = {
  title: string;
  subtitle: string;
  resetTitle: string;
  resetSubtitle: string;
  email: string;
  password: string;
  forgot: string;
  signIn: string;
  signingIn: string;
  back: string;
  invite: string;
  showPassword: string;
  hidePassword: string;
  errEmailEmpty: string;
  errEmailBad: string;
  errPwEmpty: string;
  errWrong: string;
  errLocked: string;

  cpTitle: string;
  cpSubtitle: string;
  cpTempNotice: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  updatePassword: string;
  updatingPassword: string;
  backToDashboard: string;
  signOut: string;
  errCurrentEmpty: string;
  errNewEmpty: string;
  errNewShort: string;
  errConfirmEmpty: string;
  errConfirmMismatch: string;
};

export const COPY: Record<Lang, Copy> = {
  en: {
    title: "Sign in",
    subtitle: "Use the email your farm admin invited.",
    resetTitle: "Reset password",
    resetSubtitle:
      "There's no self-service reset — ask your farm admin. They'll set a temporary password, and you'll choose your own the moment you sign back in.",
    email: "Email",
    password: "Password",
    forgot: "Forgot password?",
    signIn: "Sign in",
    signingIn: "Signing in…",
    back: "Back to sign in",
    invite:
      "New here? Your farm admin creates your account and gives you a temporary password to sign in with.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    errEmailEmpty: "Enter your email",
    errEmailBad: "That doesn't look like an email address",
    errPwEmpty: "Enter your password",
    errWrong: "Email or password is incorrect. Check both and try again.",
    errLocked: "Too many attempts. Wait a few minutes or ask your admin to reset your password.",

    cpTitle: "Set a new password",
    cpSubtitle: "Choose a password only you know.",
    cpTempNotice:
      "You signed in with a temporary password. Set your own to continue.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    updatePassword: "Update password",
    updatingPassword: "Updating…",
    backToDashboard: "Back to dashboard",
    signOut: "Sign out",
    errCurrentEmpty: "Enter your current password",
    errNewEmpty: "Enter a new password",
    errNewShort: `Must be at least ${PASSWORD_MIN_LENGTH} characters`,
    errConfirmEmpty: "Confirm your new password",
    errConfirmMismatch: "Passwords don't match",
  },
  id: {
    title: "Masuk",
    subtitle: "Gunakan email yang diundang oleh admin tambak Anda.",
    resetTitle: "Atur ulang kata sandi",
    resetSubtitle:
      "Tidak ada atur ulang mandiri — minta admin tambak Anda. Mereka akan memberi kata sandi sementara, dan Anda akan memilih kata sandi sendiri begitu masuk kembali.",
    email: "Email",
    password: "Kata sandi",
    forgot: "Lupa kata sandi?",
    signIn: "Masuk",
    signingIn: "Sedang masuk…",
    back: "Kembali ke halaman masuk",
    invite:
      "Baru di sini? Admin tambak Anda membuat akun Anda dan memberikan kata sandi sementara untuk masuk.",
    showPassword: "Tampilkan kata sandi",
    hidePassword: "Sembunyikan kata sandi",
    errEmailEmpty: "Masukkan email Anda",
    errEmailBad: "Format email tidak valid",
    errPwEmpty: "Masukkan kata sandi",
    errWrong: "Email atau kata sandi salah. Periksa lagi lalu coba kembali.",
    errLocked: "Terlalu banyak percobaan. Tunggu beberapa menit atau minta admin mengatur ulang kata sandi Anda.",

    cpTitle: "Buat kata sandi baru",
    cpSubtitle: "Pilih kata sandi yang hanya Anda tahu.",
    cpTempNotice:
      "Anda masuk dengan kata sandi sementara. Buat kata sandi sendiri untuk melanjutkan.",
    currentPassword: "Kata sandi saat ini",
    newPassword: "Kata sandi baru",
    confirmPassword: "Konfirmasi kata sandi baru",
    updatePassword: "Perbarui kata sandi",
    updatingPassword: "Memperbarui…",
    backToDashboard: "Kembali ke dashboard",
    signOut: "Keluar",
    errCurrentEmpty: "Masukkan kata sandi Anda saat ini",
    errNewEmpty: "Masukkan kata sandi baru",
    errNewShort: `Minimal ${PASSWORD_MIN_LENGTH} karakter`,
    errConfirmEmpty: "Konfirmasi kata sandi baru Anda",
    errConfirmMismatch: "Kata sandi tidak cocok",
  },
};
