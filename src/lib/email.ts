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

export async function sendNotificationEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }) {
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
