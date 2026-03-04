"use server";

import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";

type ActionResult = { success: true } | { success: false; error: string };

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getAccounts = cache(async () => {
  const session = await getSession();
  if (!session) return [];

  return db.query.accountMember.findMany({
    where: eq(schema.accountMember.userId, session.user.id),
    with: { tradingAccount: true },
  });
});

export async function updateProfile(name: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  try {
    await db
      .update(schema.user)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.user.id, session.user.id));
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update profile" };
  }
}

const BALANCE_MAP = {
  beginner: "10000",
  intermediate: "50000",
  expert: "100000",
} as const;

export async function createAccount(
  name: string,
  type: "investment" | "crypto",
  experience: "beginner" | "intermediate" | "expert",
  partnerEmail?: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const balance = BALANCE_MAP[experience];
  const isJoint = !!partnerEmail;

  let partnerId: string | undefined;

  if (partnerEmail) {
    const partner = await db.query.user.findFirst({
      where: eq(schema.user.email, partnerEmail),
    });

    if (!partner) {
      return { success: false, error: "No user found with that email" };
    }

    if (partner.id === session.user.id) {
      return { success: false, error: "Cannot create a joint account with yourself" };
    }

    partnerId = partner.id;
  }

  try {
    const [tradingAccount] = await db
      .insert(schema.tradingAccount)
      .values({ name, type, balance, isJoint })
      .returning();

    const members: (typeof schema.accountMember.$inferInsert)[] = [
      { accountId: tradingAccount.id, userId: session.user.id },
    ];

    if (partnerId) {
      members.push({ accountId: tradingAccount.id, userId: partnerId });
    }

    await db.insert(schema.accountMember).values(members);

    return { success: true };
  } catch {
    return { success: false, error: "Failed to create account" };
  }
}
