import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const symbolTypeEnum = pgEnum("symbol_type", ["stock", "crypto"]);
export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);
export const orderTypeEnum = pgEnum("order_type", ["market", "limit"]);
export const timeInForceEnum = pgEnum("time_in_force", ["day", "gtc"]);
export const orderStatusEnum = pgEnum("order_status", ["filled", "pending", "cancelled", "expired"]);
export const accountTypeEnum = pgEnum("account_type", ["investment", "crypto"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }),
});

export const tradingAccount = pgTable(
  "trading_account",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // "investment" (stocks/ETFs) or "crypto"
    type: accountTypeEnum("type").notNull(),
    balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("100000"),
    isJoint: boolean("is_joint").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("trading_account_type_idx").on(table.type)],
);

export const accountMember = pgTable(
  "account_member",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("account_member_accountId_idx").on(table.accountId),
    index("account_member_userId_idx").on(table.userId),
  ],
);

export const symbol = pgTable("symbol", {
  id: serial("id").primaryKey(),
  ticker: varchar("ticker").notNull().unique(),
  name: text("name").notNull(),
  type: symbolTypeEnum("type").notNull(),
  // null for crypto
  exchange: text("exchange"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolio = pgTable(
  "portfolio",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
    symbolId: integer("symbol_id").notNull().references(() => symbol.id),
    quantity: integer("quantity").notNull().default(0),
    // weighted average recalculated on each buy
    averageCost: numeric("average_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    previouslyHeld: boolean("previously_held").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("portfolio_accountId_idx").on(table.accountId),
    index("portfolio_account_symbol_idx").on(table.accountId, table.symbolId),
  ],
);

export const order = pgTable(
  "order",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
    symbolId: integer("symbol_id").notNull().references(() => symbol.id),
    side: orderSideEnum("side").notNull(),
    type: orderTypeEnum("type").notNull(),
    // only relevant for limit orders
    timeInForce: timeInForceEnum("time_in_force").notNull().default("day"),
    quantity: integer("quantity").notNull(),
    price: numeric("price", { precision: 14, scale: 4 }).notNull(),
    total: numeric("total", { precision: 14, scale: 4 }).notNull(),
    status: orderStatusEnum("status").notNull().default("filled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_accountId_idx").on(table.accountId),
    index("order_symbolId_idx").on(table.symbolId),
    index("order_status_idx").on(table.status),
  ],
);

export const quote = pgTable(
  "quote",
  {
    id: serial("id").primaryKey(),
    // one row per symbol, overwritten each poll
    symbolId: integer("symbol_id").notNull().references(() => symbol.id).unique(),
    price: doublePrecision("price").notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    volume: doublePrecision("volume"),
    change: doublePrecision("change"),
    changePercent: doublePrecision("change_percent"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("quote_symbolId_idx").on(table.symbolId)],
);

export const quoteHistory = pgTable(
  "quote_history",
  {
    id: serial("id").primaryKey(),
    symbolId: integer("symbol_id").notNull().references(() => symbol.id),
    price: doublePrecision("price").notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    volume: doublePrecision("volume"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("quoteHistory_symbol_timestamp_idx").on(table.symbolId, table.timestamp),
  ],
);

export const watchlist = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    symbolId: integer("symbol_id").notNull().references(() => symbol.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("watchlist_userId_idx").on(table.userId),
    index("watchlist_user_symbol_idx").on(table.userId, table.symbolId),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  accountMemberships: many(accountMember),
  watchlists: many(watchlist),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const tradingAccountRelations = relations(tradingAccount, ({ many }) => ({
  members: many(accountMember),
  portfolios: many(portfolio),
  orders: many(order),
}));

export const accountMemberRelations = relations(accountMember, ({ one }) => ({
  tradingAccount: one(tradingAccount, { fields: [accountMember.accountId], references: [tradingAccount.id] }),
  user: one(user, { fields: [accountMember.userId], references: [user.id] }),
}));

export const symbolRelations = relations(symbol, ({ one, many }) => ({
  quote: one(quote, { fields: [symbol.id], references: [quote.symbolId] }),
  quoteHistory: many(quoteHistory),
  portfolios: many(portfolio),
  orders: many(order),
  watchlists: many(watchlist),
}));

export const portfolioRelations = relations(portfolio, ({ one }) => ({
  tradingAccount: one(tradingAccount, { fields: [portfolio.accountId], references: [tradingAccount.id] }),
  symbol: one(symbol, { fields: [portfolio.symbolId], references: [symbol.id] }),
}));

export const orderRelations = relations(order, ({ one }) => ({
  tradingAccount: one(tradingAccount, { fields: [order.accountId], references: [tradingAccount.id] }),
  symbol: one(symbol, { fields: [order.symbolId], references: [symbol.id] }),
}));

export const quoteRelations = relations(quote, ({ one }) => ({
  symbol: one(symbol, { fields: [quote.symbolId], references: [symbol.id] }),
}));

export const quoteHistoryRelations = relations(quoteHistory, ({ one }) => ({
  symbol: one(symbol, { fields: [quoteHistory.symbolId], references: [symbol.id] }),
}));

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  user: one(user, { fields: [watchlist.userId], references: [user.id] }),
  symbol: one(symbol, { fields: [watchlist.symbolId], references: [symbol.id] }),
}));
