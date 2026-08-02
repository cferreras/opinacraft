"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowUpRight,
  IconBrandDiscord,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconKey,
  IconLogout,
  IconMail,
  IconSearch,
  IconServer,
  IconShieldCheck,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { authClient } from "@/lib/auth-client";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const MAX_PROFILE_NAME_LENGTH = 80;
const AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function validateProfileName(value: string) {
  const name = value.trim();
  if (name.length < 2) return "El nombre debe tener al menos 2 caracteres.";
  if (name.length > MAX_PROFILE_NAME_LENGTH) return `El nombre no puede superar los ${MAX_PROFILE_NAME_LENGTH} caracteres.`;
  return null;
}

function validateAvatarFile(file: File) {
  if (!AVATAR_MIME_TYPES.has(file.type)) return "Usa una imagen PNG, JPEG o WebP.";
  if (file.size > 4_000_000) return "El archivo original debe pesar 4 MB o menos.";
  return null;
}

function ActionRow({
  icon,
  title,
  description,
  label,
  onClick,
  href,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  label: string;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          tone === "danger"
            ? "bg-[#fff0f0] text-[#d33d46]"
            : "bg-[#f0f1ff] text-[#3039dc]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span
          className={`block text-[12px] font-semibold ${
            tone === "danger" ? "text-[#c8343e]" : "text-[#1c2739]"
          }`}
        >
          {title}
        </span>
        <span className="mt-1 block text-[11px] leading-4 text-[#788397]">
          {description}
        </span>
      </span>
      <IconChevronRight
        aria-hidden="true"
        size={17}
        stroke={1.7}
        className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${
          tone === "danger" ? "text-[#d88389]" : "text-[#9aa4b5]"
        }`}
      />
    </>
  );

  const className = `group flex min-h-[64px] w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
    tone === "danger"
      ? "border-[#f0d9da] hover:border-[#e7afb2] hover:bg-[#fffafa]"
      : "border-[#e0e5ea] hover:border-[#b8c0ff] hover:bg-[#fafaff]"
  }`;

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {content}
    </button>
  );
}

type LinkedAccount = {
  providerId: string;
};

function socialProviderLabel(providerId: string) {
  if (providerId === "discord") return "Discord";
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, isPending, refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [profileNameDraft, setProfileNameDraft] = useState<string | null>(null);
  const [avatarUrlDraft, setAvatarUrlDraft] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarRemovalRequested, setAvatarRemovalRequested] = useState(false);
  const [newEmailDraft, setNewEmailDraft] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
  const [accountState, setAccountState] = useState<{
    status: "loading" | "ready" | "error";
    accounts: LinkedAccount[];
    error?: string;
  }>({ status: "loading", accounts: [] });

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in");
    }
  }, [isPending, router, session]);

  useEffect(() => {
    let isActive = true;

    if (!session) {
      return () => {
        isActive = false;
      };
    }

    void authClient
      .listAccounts()
      .then(({ data, error: listAccountsError }) => {
        if (!isActive) return;
        if (listAccountsError) {
          setAccountState({
            status: "error",
            accounts: [],
            error: listAccountsError.message ?? "No se pudieron cargar los métodos de acceso.",
          });
          return;
        }
        setAccountState({ status: "ready", accounts: data ?? [] });
      })
      .catch((caughtError) => {
        if (!isActive) return;
        setAccountState({
          status: "error",
          accounts: [],
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudieron cargar los métodos de acceso.",
        });
      });

    return () => {
      isActive = false;
    };
  }, [session]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  async function handleLogout() {
    setError(null);
    setIsLoggingOut(true);

    try {
      const { error: logoutError } = await authClient.signOut();

      if (logoutError) {
        setError(logoutError.message ?? "Unable to log out.");
        return;
      }

      router.replace("/sign-in");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to log out.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function exportAccount() {
    setAccountMessage(null);

    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) {
        setAccountMessage("No se pudo exportar la cuenta.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "opinacraft-cuenta.json";
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setAccountMessage("Exportación descargada.");
    } catch {
      setAccountMessage("No se pudo exportar la cuenta.");
    }
  }

  async function deleteAccount() {
    if (window.prompt("Escribe DELETE ACCOUNT para confirmar") !== "DELETE ACCOUNT") {
      return;
    }

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE ACCOUNT" }),
      });

      if (!response.ok) {
        setAccountMessage("No se pudo borrar la cuenta.");
        return;
      }

      await authClient.signOut();
      router.replace("/");
    } catch {
      setAccountMessage("No se pudo borrar la cuenta.");
    }
  }

  async function handleSendVerification() {
    if (!session) return;
    setVerificationMessage(null);
    setIsSendingVerification(true);

    try {
      const { error: requestError } = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: "/profile",
      });
      setVerificationMessage(
        requestError
          ? requestError.message ?? "No se pudo enviar el email."
          : "Te hemos enviado un nuevo enlace de verificación.",
      );
    } catch (caughtError) {
      setVerificationMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo enviar el email.",
      );
    } finally {
      setIsSendingVerification(false);
    }
  }

  function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setProfileMessage(null);
    setProfileError(null);

    if (!file) {
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      return;
    }

    const fileError = validateAvatarFile(file);
    if (fileError) {
      event.target.value = "";
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      setProfileError(fileError);
      return;
    }

    setAvatarRemovalRequested(false);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setAvatarFile(file);
  }

  function handleAvatarClear() {
    setProfileMessage(null);
    setProfileError(null);

    if (avatarFile) {
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      return;
    }

    if (avatarUrl.trim()) setAvatarRemovalRequested(true);
  }

  async function handleProfileUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);

    const normalizedName = profileName.trim();
    const nameError = validateProfileName(normalizedName);

    if (nameError) {
      setProfileError(nameError);
      return;
    }

    setIsSavingProfile(true);

    try {
      const { error: updateError } = await authClient.updateUser({ name: normalizedName });

      if (updateError) {
        setProfileError(updateError.message ?? "No se pudo actualizar el perfil.");
        return;
      }

      setProfileNameDraft(normalizedName);
      let nextAvatarUrl = avatarUrl;
      if (avatarFile) {
        const body = new FormData();
        body.set("file", avatarFile);
        const response = await fetch("/api/account/avatar", { method: "POST", body });
        const result = (await response.json().catch(() => ({}))) as { error?: string; url?: string };
        if (!response.ok || !result.url) {
          throw new Error(result.error ?? "No se pudo subir el avatar.");
        }
        nextAvatarUrl = result.url;
      } else if (avatarRemovalRequested) {
        const response = await fetch("/api/account/avatar", { method: "DELETE" });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? "No se pudo quitar el avatar.");
        }
        nextAvatarUrl = "";
      }

      if (avatarFile || avatarRemovalRequested) setAvatarUrlDraft(nextAvatarUrl);
      await refetchSession();
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      setAvatarRemovalRequested(false);
      setProfileMessage("Perfil actualizado.");
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo actualizar el perfil.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setEmailMessage(null);
    setEmailError(null);

    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail === session.user.email.toLowerCase()) {
      setEmailError("Escribe un correo diferente al actual.");
      return;
    }

    setIsRequestingEmailChange(true);

    try {
      const { error: changeError } = await authClient.changeEmail({
        newEmail: normalizedEmail,
        callbackURL: "/profile",
      });

      if (changeError) {
        setEmailError(changeError.message ?? "No se pudo solicitar el cambio de correo.");
        return;
      }

      setNewEmailDraft(normalizedEmail);
      setEmailMessage(
        session.user.emailVerified
          ? "Revisa tu correo actual para aprobar el cambio. Después recibirás un enlace en la nueva dirección."
          : "Revisa el enlace que llegará a la nueva dirección para confirmar el cambio.",
      );
    } catch (caughtError) {
      setEmailError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo solicitar el cambio de correo.",
      );
    } finally {
      setIsRequestingEmailChange(false);
    }
  }

  if (isPending || !session) {
    return (
      <main className="app-shell flex min-h-screen items-center justify-center px-6">
        <p className="text-[12px] text-[#748095]">Cargando perfil...</p>
      </main>
    );
  }

  const isVerified = Boolean(session.user.emailVerified);
  const profileName = profileNameDraft ?? session.user.name;
  const userName = profileName.trim() || "Usuario";
  const avatarUrl = avatarUrlDraft ?? session.user.image ?? "";
  const displayedAvatarUrl = avatarRemovalRequested ? "" : avatarPreviewUrl ?? avatarUrl;
  const newEmail = newEmailDraft ?? session.user.email;
  const linkedAccounts = accountState.accounts;
  const areAccountsLoading = accountState.status === "loading";
  const accountsError = accountState.status === "error" ? accountState.error : null;
  const hasCredentialAccount = linkedAccounts.some((account) => account.providerId === "credential");
  const socialAccount = linkedAccounts.find((account) => account.providerId !== "credential");
  const isSocialOnlyAccount = !areAccountsLoading && linkedAccounts.length > 0 && !hasCredentialAccount && Boolean(socialAccount);
  const socialProvider = socialAccount ? socialProviderLabel(socialAccount.providerId) : null;
  const canChangePassword = areAccountsLoading || hasCredentialAccount || !socialAccount || Boolean(accountsError);

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="app-main page-shell px-4 pb-12 sm:px-6 lg:px-7 2xl:px-8">
        <div className="pt-7 sm:pt-8">
          <section className="flex flex-col gap-5 border-b border-[#e7ebef] pb-7 sm:flex-row sm:items-end sm:justify-between" aria-labelledby="profile-heading">
            <div>
              <p className="ui-eyebrow">Espacio personal</p>
              <h1 id="profile-heading" className="ui-page-title mt-2.5">
                Tu perfil
              </h1>
              <p className="mt-2 max-w-[620px] text-[13px] leading-[1.55] text-[#55627b]">
                Gestiona tu identidad, seguridad y acceso a tus comunidades.
              </p>
            </div>

            <Link
              href="/servers"
              className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-[#cbd2ff] px-3.5 text-[12px] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff] sm:self-auto"
            >
              Explorar servidores
              <IconArrowUpRight aria-hidden="true" size={16} stroke={1.8} />
            </Link>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_286px]" aria-label="Resumen de cuenta">
            <div className="min-w-0">
              <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,30,45,0.02)] sm:p-6" aria-labelledby="identity-heading">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  {displayedAvatarUrl ? (
                    <img
                      src={displayedAvatarUrl}
                      alt={`Avatar de ${userName}`}
                      className="h-24 w-24 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 sm:h-28 sm:w-28"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-[#eef0ff] text-[30px] font-semibold tracking-[-0.05em] text-[#3039dc] ring-1 ring-[#d9ddff] sm:h-28 sm:w-28"
                    >
                      {getInitials(userName)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7b8798]">Identidad de cuenta</p>
                    <h2 id="identity-heading" className="mt-2 truncate text-[26px] font-semibold leading-tight tracking-[-0.045em] text-[#101722] sm:text-[30px]">
                      {userName}
                    </h2>
                    <p className="mt-1.5 truncate text-[13px] text-[#617087]">{session.user.email}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${isVerified ? "bg-[#e6f8ef] text-[#0c8950]" : "bg-[#fff4df] text-[#a06400]"}`}>
                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-white ${isVerified ? "bg-[#0e9a55]" : "bg-[#d4911d]"}`}>
                          {isVerified ? <IconCheck aria-hidden="true" size={11} stroke={2.4} /> : <IconClock aria-hidden="true" size={10} stroke={2.1} />}
                        </span>
                        {isVerified ? "Email verificado" : "Email pendiente"}
                      </span>
                      <span className="rounded-full bg-[#f3f5f7] px-2.5 py-1 text-[10px] font-medium text-[#5d6a7d]">Cuenta personal</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-2 border-t border-[#e7ebef] pt-5 sm:grid-cols-3">
                  <div className="rounded-lg bg-[#f7f8fa] px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7b8798]">Estado</p>
                    <p className="mt-1.5 text-[12px] font-semibold text-[#1d2a3e]">Cuenta activa</p>
                  </div>
                  <div className="rounded-lg bg-[#f7f8fa] px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7b8798]">Correo</p>
                    <p className={`mt-1.5 text-[12px] font-semibold ${isVerified ? "text-[#0e9453]" : "text-[#a06400]"}`}>{isVerified ? "Listo para publicar" : "Requiere verificación"}</p>
                  </div>
                  <div className="rounded-lg bg-[#f7f8fa] px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7b8798]">Acceso</p>
                    <p className="mt-1.5 text-[12px] font-semibold text-[#1d2a3e]">OpinaCraft</p>
                  </div>
                </div>
              </section>

              <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e6eb] bg-white shadow-[0_1px_2px_rgba(16,30,45,0.02)]" aria-labelledby="edit-profile-heading">
                <div className="border-b border-[#e7ebef] px-5 py-4 sm:px-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b8798]">Perfil público</p>
                  <h2 id="edit-profile-heading" className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Edita tu identidad</h2>
                  <p className="mt-2 text-[12px] leading-5 text-[#68758a]">Tu nombre y avatar aparecen cuando publicas o participas en una comunidad.</p>
                </div>
                <form onSubmit={handleProfileUpdate} className="grid gap-5 p-4 sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label htmlFor="profile-name" className="block text-[11px] font-semibold text-[#263248]">
                      Nombre visible
                      <input
                        id="profile-name"
                        name="name"
                        type="text"
                        value={profileName}
                        onChange={(event) => setProfileNameDraft(event.target.value)}
                        maxLength={MAX_PROFILE_NAME_LENGTH}
                        autoComplete="name"
                        className="mt-2 h-10 w-full rounded-lg border border-[#dce2e7] bg-white px-3 text-[12px] font-normal text-[#1f2b40] outline-none transition placeholder:text-[#9aa4b5] focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/10"
                      />
                    </label>
                    <div>
                      <p className="text-[11px] font-semibold text-[#263248]">Avatar</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="profile-avatar"
                          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#cbd2ff] bg-white px-3.5 text-[12px] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff]"
                        >
                          <IconUpload aria-hidden="true" size={16} stroke={1.8} />
                          {avatarFile ? "Cambiar avatar" : "Subir avatar"}
                          <input
                            id="profile-avatar"
                            name="image"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            aria-label="Avatar"
                            aria-describedby="profile-avatar-help"
                            onChange={handleAvatarFileChange}
                            className="sr-only"
                          />
                        </label>
                        {avatarUrl || avatarFile ? (
                          <button
                            type="button"
                            onClick={handleAvatarClear}
                            className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-[11px] font-semibold text-[#68758a] transition hover:bg-[#f7f8fa] hover:text-[#c43b45]"
                          >
                            {avatarFile ? "Cancelar selección" : "Quitar avatar"}
                          </button>
                        ) : null}
                      </div>
                      <p id="profile-avatar-help" className="mt-2 text-[10px] leading-4 text-[#7b8798]">PNG, JPEG o WebP · máximo 4 MB. Se optimiza a WebP.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[#e7ebef] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      {displayedAvatarUrl.trim() ? (
                        <img
                          src={displayedAvatarUrl.trim()}
                          alt="Vista previa del avatar"
                          className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                        />
                      ) : (
                        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef0ff] text-[13px] font-semibold text-[#3039dc] ring-1 ring-[#d9ddff]">
                          {getInitials(profileName || userName)}
                        </span>
                      )}
                      <span className="text-[11px] text-[#7b8798]">Vista previa del perfil</span>
                    </div>
                    <button
                      type="submit"
                      aria-label="Guardar cambios"
                      disabled={isSavingProfile}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#2d2de4] px-4 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(45,45,228,0.16)] transition hover:bg-[#2821c8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingProfile ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                  {profileError ? <p className="rounded-lg border border-[#f0d5d7] bg-[#fff8f8] px-3 py-2 text-[11px] text-[#bd3741]" role="alert">{profileError}</p> : null}
                  {profileMessage ? <p className="rounded-lg border border-[#d6ebdf] bg-[#f5fcf7] px-3 py-2 text-[11px] text-[#0e8750]" aria-live="polite">{profileMessage}</p> : null}
                </form>
              </section>

              <section className="mt-4 overflow-hidden rounded-2xl border border-[#e0e6eb] bg-white shadow-[0_1px_2px_rgba(16,30,45,0.02)]" aria-labelledby="email-heading">
                <div className="border-b border-[#e7ebef] px-5 py-4 sm:px-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b8798]">Correo de contacto</p>
                  <h2 id="email-heading" className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Cambia tu email</h2>
                  <p className="mt-2 text-[12px] leading-5 text-[#68758a]">El cambio queda pendiente hasta confirmar la dirección por correo.</p>
                </div>
                <form onSubmit={handleEmailChange} className="grid gap-4 p-4 sm:p-5">
                  <label htmlFor="profile-email" className="block text-[11px] font-semibold text-[#263248]">
                    Nuevo correo electrónico
                    <input
                      id="profile-email"
                      name="email"
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmailDraft(event.target.value)}
                      autoComplete="email"
                      className="mt-2 h-10 w-full rounded-lg border border-[#dce2e7] bg-white px-3 text-[12px] font-normal text-[#1f2b40] outline-none transition placeholder:text-[#9aa4b5] focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/10"
                    />
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-4 text-[#7b8798]">Tu email actual seguirá activo mientras completas la verificación.</p>
                    <button
                      type="submit"
                      aria-label="Solicitar cambio de correo"
                      disabled={isRequestingEmailChange}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#cbd2ff] px-3.5 text-[12px] font-semibold text-[#2d34cf] transition hover:bg-[#f0f1ff] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <IconMail aria-hidden="true" size={16} stroke={1.7} />
                      {isRequestingEmailChange ? "Solicitando..." : "Solicitar cambio"}
                    </button>
                  </div>
                  {emailError ? <p className="rounded-lg border border-[#f0d5d7] bg-[#fff8f8] px-3 py-2 text-[11px] text-[#bd3741]" role="alert">{emailError}</p> : null}
                  {emailMessage ? <p className="rounded-lg border border-[#d9e0ff] bg-[#f7f8ff] px-3 py-2 text-[11px] leading-5 text-[#3542bb]" aria-live="polite">{emailMessage}</p> : null}
                  {isSocialOnlyAccount ? <p className="inline-flex items-center gap-1.5 text-[11px] text-[#68758a]"><IconBrandDiscord aria-hidden="true" size={15} stroke={1.7} className="text-[#5661d8]" /> También funciona si iniciaste sesión con {socialProvider}.</p> : null}
                </form>
              </section>

              {!isVerified ? (
                <section className="mt-4 rounded-2xl border border-[#f0ddb4] bg-[#fffaf0] p-5" aria-labelledby="verification-heading">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fff0cf] text-[#b97900]">
                      <IconShieldCheck size={19} stroke={1.7} />
                    </span>
                    <div className="min-w-0">
                      <h2 id="verification-heading" className="text-[14px] font-semibold text-[#815500]">Verifica tu email para publicar servidores</h2>
                      <p className="mt-1 text-[12px] leading-5 text-[#9a6c18]">Necesitamos confirmar que la cuenta te pertenece antes de activar las funciones de publicación.</p>
                      <button
                        type="button"
                        onClick={handleSendVerification}
                        disabled={isSendingVerification}
                        className="mt-3 inline-flex h-8 items-center rounded-md border border-[#e5c77f] bg-white px-3 text-[11px] font-semibold text-[#986500] transition hover:bg-[#fff5df] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSendingVerification ? "Enviando..." : "Reenviar enlace"}
                      </button>
                      {verificationMessage ? <p className="mt-2 text-[11px] font-medium text-[#815500]" aria-live="polite">{verificationMessage}</p> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {error ? <p className="mt-4 rounded-xl border border-[#f0d5d7] bg-[#fff8f8] px-4 py-3 text-[12px] text-[#bd3741]" role="alert">{error}</p> : null}
              {accountMessage ? <p className="mt-4 rounded-xl border border-[#d9e0ff] bg-[#f7f8ff] px-4 py-3 text-[12px] text-[#3542bb]" aria-live="polite">{accountMessage}</p> : null}

              <section className="mt-6 overflow-hidden rounded-2xl border border-[#e0e6eb] bg-white shadow-[0_1px_2px_rgba(16,30,45,0.02)]" aria-labelledby="security-heading">
                <div className="border-b border-[#e7ebef] px-5 py-4 sm:px-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b8798]">Seguridad y datos</p>
                  <h2 id="security-heading" className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Controla tu cuenta</h2>
                </div>
                <div className="grid gap-2.5 p-4 sm:p-5">
                  {canChangePassword ? (
                    <Link href="/change-password" aria-label="Cambiar contraseña" className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-[#e0e5ea] px-3.5 py-3 transition hover:border-[#b8c0ff] hover:bg-[#fafaff]">
                      <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#3039dc]"><IconKey size={18} stroke={1.7} /></span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-[12px] font-semibold text-[#1c2739]">Cambiar contraseña</span>
                        <span className="mt-1 block text-[11px] leading-4 text-[#788397]">Actualiza la contraseña de tu cuenta.</span>
                      </span>
                      <IconChevronRight aria-hidden="true" size={17} stroke={1.7} className="shrink-0 text-[#9aa4b5] transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  ) : (
                    <div className="flex min-h-[64px] items-start gap-3 rounded-xl border border-[#dfe3f8] bg-[#f8f8ff] px-3.5 py-3">
                      <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8e9ff] text-[#5661d8]"><IconBrandDiscord size={18} stroke={1.7} /></span>
                      <span className="min-w-0 text-left">
                        <span className="block text-[12px] font-semibold text-[#313a91]">Acceso administrado por {socialProvider ?? "tu proveedor"}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-[#68758a]">Esta cuenta no tiene una contraseña local. Sigue usando {socialProvider ?? "tu proveedor social"} para iniciar sesión.</span>
                      </span>
                    </div>
                  )}
                  <ActionRow
                    icon={<IconDownload size={18} stroke={1.7} />}
                    title="Exportar mis datos"
                    description="Descarga una copia de la información de tu cuenta."
                    label="Exportar mis datos"
                    onClick={() => void exportAccount()}
                  />
                </div>
              </section>
            </div>

            <aside className="grid content-start gap-4" aria-label="Acciones de perfil">
              <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,30,45,0.02)]" aria-labelledby="workspace-heading">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b8798]">Atajos</p>
                <h2 id="workspace-heading" className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Tu espacio</h2>
                <p className="mt-2 text-[12px] leading-5 text-[#68758a]">Continúa donde lo dejaste o descubre una nueva comunidad.</p>
                <div className="mt-5 grid gap-2.5">
                  <Link href="/dashboard/servers" aria-label="Servidores gestionados" className="group flex min-h-[52px] items-center gap-3 rounded-xl border border-[#dce2e8] px-3.5 py-2.5 transition hover:border-[#b8c0ff] hover:bg-[#fafaff]">
                    <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#3039dc]"><IconServer size={17} stroke={1.7} /></span>
                    <span className="min-w-0 flex-1 text-[12px] font-semibold text-[#263248]">Servidores gestionados</span>
                    <IconChevronRight aria-hidden="true" size={16} stroke={1.7} className="shrink-0 text-[#9aa4b5] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link href="/servers" aria-label="Explorar servidores" className="group flex min-h-[52px] items-center gap-3 rounded-xl border border-[#dce2e8] px-3.5 py-2.5 transition hover:border-[#b8c0ff] hover:bg-[#fafaff]">
                    <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f4f5f7] text-[#607087]"><IconSearch size={17} stroke={1.7} /></span>
                    <span className="min-w-0 flex-1 text-[12px] font-semibold text-[#263248]">Explorar servidores</span>
                    <IconChevronRight aria-hidden="true" size={16} stroke={1.7} className="shrink-0 text-[#9aa4b5] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </section>

              <section className="rounded-2xl border border-[#e0e6eb] bg-[#fbfcff] p-5" aria-labelledby="session-heading">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7b8798]">Sesión actual</p>
                <h2 id="session-heading" className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Acceso a OpinaCraft</h2>
                <p className="mt-2 text-[12px] leading-5 text-[#68758a]">Cierra la sesión cuando uses un dispositivo compartido.</p>
                <button
                  type="button"
                  aria-label="Cerrar sesión"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2d2de4] px-3.5 text-[12px] font-semibold text-white shadow-[0_5px_12px_rgba(45,45,228,0.16)] transition hover:bg-[#2821c8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconLogout aria-hidden="true" size={16} stroke={1.8} />
                  {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
                </button>
              </section>

              <section className="rounded-2xl border border-[#f0d9da] bg-white p-5" aria-labelledby="danger-heading">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#c75a61]">Zona de cuenta</p>
                <h2 id="danger-heading" className="mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Eliminar cuenta</h2>
                <p className="mt-2 text-[12px] leading-5 text-[#788397]">Esta acción es permanente y elimina tus datos asociados.</p>
                <ActionRow
                  icon={<IconTrash size={18} stroke={1.7} />}
                  title="Borrar cuenta"
                  description="Eliminar permanentemente tus datos."
                  label="Borrar cuenta"
                  onClick={() => void deleteAccount()}
                  tone="danger"
                />
              </section>

              <Link href="/servers/new" className="inline-flex items-center justify-center gap-2 text-[11px] font-semibold text-[#2d34cf] transition hover:text-[#1d28b9]">
                Publicar un servidor
                <IconArrowUpRight aria-hidden="true" size={15} stroke={1.8} />
              </Link>
            </aside>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
