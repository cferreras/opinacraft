import { Resend } from "resend";

import { serverEnv } from "@/env/server";

type PasswordResetEmail = {
  to: string;
  url: string;
};

type VerificationEmail = {
  to: string;
  url: string;
};

type ChangeEmailConfirmationEmail = {
  to: string;
  currentEmail: string;
  newEmail: string;
  url: string;
};

type EmailMessageType =
  | "notification"
  | "password-reset"
  | "verification"
  | "change-email";

function skipEmail(messageType: EmailMessageType) {
  if (serverEnv.NODE_ENV !== "production" && serverEnv.E2E_DISABLE_EMAIL === "true") {
    console.info(`[email] skipped ${messageType} email delivery`);
    return true;
  }
  return false;
}

export async function sendNotificationEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }) {
  if (skipEmail("notification")) return;
  const apiKey = serverEnv.RESEND_API_KEY;
  const from = serverEnv.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("El correo no está configurado.");
  const { error } = await new Resend(apiKey).emails.send({ from, to: [to], subject, text, html });
  if (error) throw new Error(error.message);
}

export async function sendPasswordResetEmail({
  to,
  url,
}: PasswordResetEmail) {
  if (skipEmail("password-reset")) return;
  const apiKey = serverEnv.RESEND_API_KEY;
  const from = serverEnv.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error(
      "Password reset email is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Reset your OpinaCraft password",
    text: `Reset your password using this link: ${url}`,
    html: `<p>Reset your OpinaCraft password by clicking the link below.</p><p><a href="${url}">Reset your password</a></p>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendVerificationEmail({
  to,
  url,
}: VerificationEmail) {
  if (skipEmail("verification")) return;
  const apiKey = serverEnv.RESEND_API_KEY;
  const from = serverEnv.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error(
      "Email verification is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Verifica tu email de OpinaCraft",
    text: `Verifica tu email para publicar servidores en OpinaCraft: ${url}`,
    html: `<p>Verifica tu email para publicar servidores en OpinaCraft.</p><p><a href="${url}">Verificar email</a></p>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendChangeEmailConfirmationEmail({
  to,
  currentEmail,
  newEmail,
  url,
}: ChangeEmailConfirmationEmail) {
  if (skipEmail("change-email")) return;
  const apiKey = serverEnv.RESEND_API_KEY;
  const from = serverEnv.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error(
      "Email change confirmation is not configured. Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Confirma el cambio de email de OpinaCraft",
    text: `Confirma el cambio de email de ${currentEmail} a ${newEmail} usando este enlace: ${url}`,
    html: `<p>Confirma el cambio de email de OpinaCraft.</p><p><a href="${url}">Confirmar cambio de email</a></p>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}
