"use server";

import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { del, put } from "@/lib/api";

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
  beginner: "100000",
  intermediate: "50000",
  advanced: "25000",
  expert: "10000",
} as const;

export async function createAccount(
  name: string,
  type: "investment" | "crypto",
  experience: "beginner" | "intermediate" | "advanced" | "expert",
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
      .values({ name, type, balance, isJoint, experienceLevel: experience })
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

async function assertAccountMember(accountId: number, userId: string) {
  const member = await db.query.accountMember.findFirst({
    where: and(
      eq(schema.accountMember.accountId, accountId),
      eq(schema.accountMember.userId, userId),
    ),
  });
  return !!member;
}

export async function resetAccountBalance(
  accountId: number,
  experience: "beginner" | "intermediate" | "advanced" | "expert",
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const authorized = await assertAccountMember(accountId, session.user.id);
  if (!authorized) return { success: false, error: "Not authorized" };

  const result = await put<{ id: number }>(`/accounts/${accountId}`, {
    experience_level: experience,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}

export async function deleteAccount(accountId: number): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const authorized = await assertAccountMember(accountId, session.user.id);
  if (!authorized) return { success: false, error: "Not authorized" };

  const result = await del<{ id: number }>(`/accounts/${accountId}`);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}
