import { EMAIL_FROM, getResend } from "./resend";
import { sendDevEmail } from "./dev";
import {
  sendChangeEmailConfirmationEmail,
  sendResetPasswordEmail,
} from "./send";

const isDevelopment = process.env.NODE_ENV === "development";

export async function sendResetPasswordAction({
  userEmail,
  resetLink,
}: {
  userEmail: string;
  resetLink: string;
}) {
  const resend = getResend();

  if (!resend && isDevelopment) {
    return sendDevEmail({
      from: EMAIL_FROM,
      to: userEmail,
      subject: "Reset your password",
      text: `Reset your password: ${resetLink}`,
      _mockContext: { type: "reset", data: { userEmail, resetLink } },
    });
  }

  if (!resend) {
    throw new Error("RESEND_API_KEY not set");
  }

  const { error } = await sendResetPasswordEmail(resend, {
    userEmail,
    resetLink,
  });

  if (error) {
    console.error(`Failed to send reset email to ${userEmail}:`, error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function sendChangeEmailAction({
  currentEmail,
  newEmail,
  confirmLink,
}: {
  currentEmail: string;
  newEmail: string;
  confirmLink: string;
}) {
  const resend = getResend();

  if (!resend && isDevelopment) {
    return sendDevEmail({
      from: EMAIL_FROM,
      to: currentEmail,
      subject: "Approve email change",
      text: `Approve email change to ${newEmail}: ${confirmLink}`,
      _mockContext: {
        type: "change-email",
        data: { currentEmail, newEmail, confirmLink },
      },
    });
  }

  if (!resend) {
    throw new Error("RESEND_API_KEY not set");
  }

  const { error } = await sendChangeEmailConfirmationEmail(resend, {
    currentEmail,
    newEmail,
    confirmLink,
  });

  if (error) {
    console.error(
      `Failed to send change-email confirmation to ${currentEmail}:`,
      error,
    );
    return { success: false, error: error.message };
  }

  return { success: true };
}
