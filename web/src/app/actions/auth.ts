"use server";

import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { del, put } from "@/lib/api";
import { BALANCE_MAP, type Experience } from "@/lib/experience";

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

export async function createAccount(
  name: string,
  type: "investment" | "crypto",
  experience: Experience,
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
    // All three writes (account row + members + seed deposit) must succeed
    // together. A partial failure (e.g. the deposit insert errors) would
    // leave an account without its seed deposit, permanently breaking the
    // running-cash walk in getAllTransactions for that account.
    await db.transaction(async (tx) => {
      const [tradingAccount] = await tx
        .insert(schema.tradingAccount)
        .values({ name, type, balance, isJoint, experienceLevel: experience })
        .returning();

      const members: (typeof schema.accountMember.$inferInsert)[] = [
        { accountId: tradingAccount.id, userId: session.user.id },
      ];

      if (partnerId) {
        members.push({ accountId: tradingAccount.id, userId: partnerId });
      }

      await tx.insert(schema.accountMember).values(members);

      // Seed the transaction history with the starting deposit so the ledger
      // balances back to zero instead of the implicit $100k floor.
      await tx.insert(schema.transaction).values({
        kind: "deposit",
        tradingAccountId: tradingAccount.id,
        total: balance,
      });
    });

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
  experience: Experience,
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

export async function renameAccount(
  accountId: number,
  name: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "Name cannot be empty" };
  }

  const authorized = await assertAccountMember(accountId, session.user.id);
  if (!authorized) return { success: false, error: "Not authorized" };

  const result = await put<{ id: number }>(`/accounts/${accountId}`, {
    name: trimmed,
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
