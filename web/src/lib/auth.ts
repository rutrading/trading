import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import { bearer } from "better-auth/plugins/bearer";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  sendChangeEmailAction,
  sendResetPasswordAction,
  sendVerifyEmailAction,
} from "./email/actions";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited to avoid timing attacks
      sendResetPasswordAction({ userEmail: user.email, resetLink: url });
    },
    resetPasswordTokenExpiresIn: 3600,
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        // Not awaited to avoid timing attacks
        sendChangeEmailAction({
          currentEmail: user.email,
          newEmail,
          confirmLink: url,
        });
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Not awaited to avoid timing attacks
      sendVerifyEmailAction({ userEmail: user.email, verifyLink: url });
    },
  },
  plugins: [jwt(), bearer(), nextCookies()],
  experimental: { joins: true },
});
