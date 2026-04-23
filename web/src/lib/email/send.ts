import type { Resend } from "resend";
import { EMAIL_FROM } from "./resend";
import { ResetPasswordEmail } from "./templates/reset-password";
import { ChangeEmailConfirmation } from "./templates/change-email";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function isRetryable(error: { name?: string; message?: string }): boolean {
  const name = (error.name ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  return (
    name.includes("rate_limit") ||
    name.includes("internal_server") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused")
  );
}

function retryDelay(attempt: number): Promise<void> {
  const ms = Math.min(
    BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000,
    MAX_DELAY_MS,
  );
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(
  resend: Resend,
  payload: Parameters<Resend["emails"]["send"]>[0],
  idempotencyKey: string,
) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send(payload, {
        idempotencyKey,
      });
      if (data) return { data, error: null };
      if (error) {
        if (attempt < MAX_RETRIES && isRetryable(error)) {
          await retryDelay(attempt);
          continue;
        }
        return { data: null, error };
      }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await retryDelay(attempt);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { name: "network_error", message } };
    }
  }
  return {
    data: null,
    error: { name: "unknown_error", message: "Email send failed after retries" },
  };
}

export async function sendVerifyEmail(
  resend: Resend,
  { userEmail, verifyLink }: { userEmail: string; verifyLink: string },
) {
  return sendWithRetry(
    resend,
    {
      from: EMAIL_FROM,
      to: userEmail,
      subject: "Verify your email",
      text: `Verify your email: ${verifyLink}`,
      tags: [{ name: "category", value: "verify-email" }],
    },
    `rutrading:verify:${userEmail}:${verifyLink}`,
  );
}

export async function sendResetPasswordEmail(
  resend: Resend,
  { userEmail, resetLink }: { userEmail: string; resetLink: string },
) {
  return sendWithRetry(
    resend,
    {
      from: EMAIL_FROM,
      to: userEmail,
      subject: "Reset your password",
      react: ResetPasswordEmail({ userEmail, resetLink }),
      text: `Reset your password: ${resetLink}`,
      tags: [{ name: "category", value: "password-reset" }],
    },
    `rutrading:reset:${userEmail}:${resetLink}`,
  );
}

export async function sendChangeEmailConfirmationEmail(
  resend: Resend,
  {
    currentEmail,
    newEmail,
    confirmLink,
  }: { currentEmail: string; newEmail: string; confirmLink: string },
) {
  return sendWithRetry(
    resend,
    {
      from: EMAIL_FROM,
      to: currentEmail,
      subject: "Approve email change",
      react: ChangeEmailConfirmation({ currentEmail, newEmail, confirmLink }),
      text: `Approve email change to ${newEmail}: ${confirmLink}`,
      tags: [{ name: "category", value: "change-email" }],
    },
    `rutrading:change-email:${currentEmail}:${newEmail}`,
  );
}
