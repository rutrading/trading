// Resolve a `?account=<id>` URL parameter against the user's actual
// trading accounts. Five (accounts)/* page components had this same
// boilerplate inline — building `accountsById`, parsing the param,
// validating it against `allAccountIds`, and computing `activeIds` /
// `scopedAccount`. Centralizing it lowers the chance that one page
// silently forgets the `allAccountIds.includes(scopedId)` membership
// guard, which would otherwise let a stale link to an unauthorized
// account slip through.

export type AccountType = "investment" | "crypto" | "kalshi";
export type BrokerageAccountType = Exclude<AccountType, "kalshi">;

export type AccountInfo = {
  name: string;
  type: AccountType;
};

// Loose shape for the `getAccounts()` Drizzle result so this helper
// doesn't have to import the schema or pin to a Drizzle inferred type
// (which differs between server-action and direct-query call sites).
export type AccountMemberLike = {
  tradingAccount: {
    id: number;
    name: string;
    type: AccountType;
  };
};

export function isBrokerageAccount(
  type: AccountType,
): type is BrokerageAccountType {
  return type === "investment" || type === "crypto";
}

export function filterBrokerageMembers<
  T extends { tradingAccount: { type: AccountType } },
>(members: T[]): T[] {
  return members.filter((m) => isBrokerageAccount(m.tradingAccount.type));
}

export type AccountScope = {
  // Account ID the user is currently filtered to, or null when looking
  // at all accounts.
  scopedId: number | null;
  // The single scoped account's metadata, or null when unscoped.
  scopedAccount: AccountInfo | null;
  // Account IDs to query against — either [scopedId] when scoped, or
  // every account ID the user belongs to.
  activeIds: number[];
  // Every account ID the user belongs to, regardless of scope. Used by
  // pages that need both the "all accounts" set and the scoped subset.
  allAccountIds: number[];
  // Map keyed by trading account ID → metadata. Components like the
  // holdings list and orders table use it to render account names
  // alongside per-row data.
  accountsById: Record<number, AccountInfo>;
};

export function resolveAccountScope(
  accounts: AccountMemberLike[],
  accountParam: string | undefined,
): AccountScope {
  const accountsById: Record<number, AccountInfo> = {};
  const allAccountIds: number[] = [];
  for (const m of accounts) {
    accountsById[m.tradingAccount.id] = {
      name: m.tradingAccount.name,
      type: m.tradingAccount.type,
    };
    allAccountIds.push(m.tradingAccount.id);
  }

  // `?account=all` (or missing param) means show every account. Any
  // other value is parsed as a numeric ID and checked against the
  // user's actual membership before we trust it — a stale link to an
  // account the user no longer belongs to should silently fall back
  // to all-accounts, not query a foreign account.
  const parsed =
    accountParam && accountParam !== "all" ? Number(accountParam) : null;
  const scopedId =
    parsed != null && allAccountIds.includes(parsed) ? parsed : null;
  const activeIds = scopedId != null ? [scopedId] : allAccountIds;
  const scopedAccount = scopedId != null ? accountsById[scopedId] : null;

  return { scopedId, scopedAccount, activeIds, allAccountIds, accountsById };
}

// Brokerage-only wrapper around `resolveAccountScope`. Strips Kalshi rows
// out of `getAccounts()` before scoping so `activeIds` never fans out
// across an account type whose data lives in a separate set of endpoints.
export function resolveBrokerageScope(
  accounts: AccountMemberLike[],
  accountParam: string | undefined,
): AccountScope {
  return resolveAccountScope(filterBrokerageMembers(accounts), accountParam);
}
