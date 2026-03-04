import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins/jwt";
import { bearer } from "better-auth/plugins/bearer";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db";
import * as schema from "../db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      // TODO: Wire up a real email service (Resend, SendGrid, etc.)
      console.log(`[AUTH] Password reset requested for ${user.email}`);
      console.log(`[AUTH] Reset URL: ${url}`);
    },
  },
  plugins: [jwt(), bearer(), nextCookies()],
  experimental: { joins: true },
});
