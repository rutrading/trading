"use server";

import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { del, post, put, type ApiResult } from "@/lib/api";
import { BALANCE_MAP, type Experience } from "@/lib/experience";
import type { BrokerageAccountType } from "@/lib/accounts";

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
  type: BrokerageAccountType,
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

  // Account starts at balance 0; the deposits endpoint below seeds the
  // starting balance so deposit-transaction shape lives in one place.
  let newAccountId: number | undefined;
  try {
    await db.transaction(async (tx) => {
      const [tradingAccount] = await tx
        .insert(schema.tradingAccount)
        .values({ name, type, balance: "0", isJoint, experienceLevel: experience })
        .returning();
      newAccountId = tradingAccount.id;

      const members: (typeof schema.accountMember.$inferInsert)[] = [
        { accountId: tradingAccount.id, userId: session.user.id },
      ];
      if (partnerId) {
        members.push({ accountId: tradingAccount.id, userId: partnerId });
      }
      await tx.insert(schema.accountMember).values(members);
    });
  } catch {
    return { success: false, error: "Failed to create account" };
  }

  const seed = await post<{ id: number }>(`/accounts/${newAccountId}/deposits`, {
    body: { amount: balance },
  });
  if (!seed.ok) {
    // Compensate so the running-cash walk's deposit anchor isn't missing.
    await del<{ id: number }>(`/accounts/${newAccountId}`);
    return { success: false, error: "Failed to create account" };
  }

  return { success: true };
}

async function isAccountMember(accountId: number, userId: string) {
  const member = await db.query.accountMember.findFirst({
    where: and(
      eq(schema.accountMember.accountId, accountId),
      eq(schema.accountMember.userId, userId),
    ),
  });
  return !!member;
}

async function withMemberAuth<T>(
  accountId: number,
  fn: () => Promise<ApiResult<T>>,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  if (!(await isAccountMember(accountId, session.user.id))) {
    return { success: false, error: "Not authorized" };
  }
  const result = await fn();
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}

export async function depositCash(
  accountId: number,
  amount: string,
): Promise<ActionResult> {
  return withMemberAuth(accountId, () =>
    post<{ id: number }>(`/accounts/${accountId}/deposits`, { body: { amount } }),
  );
}

export async function resetAccount(
  accountId: number,
  experience: Experience,
): Promise<ActionResult> {
  return withMemberAuth(accountId, () =>
    post<{ id: number }>(`/accounts/${accountId}/reset`, {
      body: { experience_level: experience },
    }),
  );
}

export async function renameAccount(
  accountId: number,
  name: string,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "Name cannot be empty" };
  }
  return withMemberAuth(accountId, () =>
    put<{ id: number }>(`/accounts/${accountId}`, { name: trimmed }),
  );
}

export async function deleteAccount(accountId: number): Promise<ActionResult> {
  return withMemberAuth(accountId, () =>
    del<{ id: number }>(`/accounts/${accountId}`),
  );
}
