import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["investment", "crypto"]);

export const assetClassEnum = pgEnum("asset_class", ["us_equity", "crypto"]);

export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);

export const orderTypeEnum = pgEnum("order_type", [
  "market",
  "limit",
  "stop",
  "stop_limit",
]);

export const timeInForceEnum = pgEnum("time_in_force", ["day", "gtc", "opg", "cls"]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "open",
  "partially_filled",
  "filled",
  "cancelled",
  "rejected",
]);

export const transactionKindEnum = pgEnum("transaction_kind", [
  "trade",
  "deposit",
  "withdrawal",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    type: accountTypeEnum("type").notNull(),
    balance: numeric("balance", { precision: 14, scale: 2 })
      .notNull()
      .default("100000"),
    reservedBalance: numeric("reserved_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    isJoint: boolean("is_joint").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("trading_account_type_idx").on(table.type)],
);

export const accountMember = pgTable(
  "account_member",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("account_member_accountId_idx").on(table.accountId),
    index("account_member_userId_idx").on(table.userId),
  ],
);

export const symbol = pgTable(
  "symbol",
  {
    ticker: text("ticker").primaryKey(), // "AAPL", "BTC/USD"
    name: text("name").notNull(), // "Apple Inc."
    exchange: text("exchange"), // "NASDAQ", "NYSE", "CRYPTO"
    assetClass: assetClassEnum("asset_class").notNull(), // "us_equity" | "crypto"
    tradable: boolean("tradable").notNull().default(true),
    fractionable: boolean("fractionable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("symbol_asset_class_idx").on(table.assetClass),
    index("symbol_name_idx").on(table.name),
  ],
);

export const quote = pgTable("quote", {
  ticker: text("ticker")
    .primaryKey()
    .references(() => symbol.ticker, { onDelete: "cascade" }),
  price: doublePrecision("price"), // latest trade price
  bidPrice: doublePrecision("bid_price"),
  bidSize: doublePrecision("bid_size"),
  askPrice: doublePrecision("ask_price"),
  askSize: doublePrecision("ask_size"),
  open: doublePrecision("open"),
  high: doublePrecision("high"),
  low: doublePrecision("low"),
  close: doublePrecision("close"),
  volume: doublePrecision("volume"),
  tradeCount: integer("trade_count"),
  vwap: doublePrecision("vwap"),
  previousClose: doublePrecision("previous_close"),
  change: doublePrecision("change"), // price - previous_close
  changePercent: doublePrecision("change_percent"),
  source: text("source"), // "alpaca_ws", "alpaca_rest", "twelvedata"
  timestamp: integer("timestamp"), // unix epoch of latest trade
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const company = pgTable("company", {
  ticker: text("ticker")
    .primaryKey()
    .references(() => symbol.ticker, { onDelete: "cascade" }),
  description: text("description"),
  sector: text("sector"),
  industry: text("industry"),
  logoUrl: text("logo_url"),
});

export const dailyBar = pgTable(
  "daily_bar",
  {
    id: serial("id").primaryKey(),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(), // "2026-03-10"
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
    tradeCount: integer("trade_count"),
    vwap: doublePrecision("vwap"),
  },
  (table) => [
    uniqueIndex("daily_bar_ticker_date_idx").on(table.ticker, table.date),
    index("daily_bar_ticker_idx").on(table.ticker),
    index("daily_bar_date_idx").on(table.date),
  ],
);

export const order = pgTable(
  "order",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker),
    assetClass: assetClassEnum("asset_class").notNull(),
    side: orderSideEnum("side").notNull(),
    orderType: orderTypeEnum("order_type").notNull(),
    timeInForce: timeInForceEnum("time_in_force").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 8 }).notNull(),
    limitPrice: numeric("limit_price", { precision: 20, scale: 10 }),
    stopPrice: numeric("stop_price", { precision: 20, scale: 10 }),
    filledQuantity: numeric("filled_quantity", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    averageFillPrice: numeric("average_fill_price", {
      precision: 20,
      scale: 10,
    }),
    referencePrice: numeric("reference_price", { precision: 20, scale: 10 }),
    status: orderStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reservedPerShare: numeric("reserved_per_share", { precision: 20, scale: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("order_trading_account_id_idx").on(table.tradingAccountId),
    index("order_ticker_idx").on(table.ticker),
    index("order_status_idx").on(table.status),
    index("order_created_at_idx").on(table.createdAt),
    // Composite indexes that match the dominant `WHERE trading_account_id = $1
    // [AND status = $2] ORDER BY created_at DESC LIMIT N OFFSET M` pattern in
    // list_orders. The planner can walk the index in order without an
    // intermediate sort and stop after N rows once the offset is reached.
    index("order_account_created_idx").on(table.tradingAccountId, table.createdAt.desc()),
    index("order_account_status_created_idx").on(
      table.tradingAccountId,
      table.status,
      table.createdAt.desc(),
    ),
  ],
);

export const transaction = pgTable(
  "transaction",
  {
    id: serial("id").primaryKey(),
    kind: transactionKindEnum("kind").notNull().default("trade"),
    orderId: integer("order_id").references(() => order.id, {
      onDelete: "cascade",
    }),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    ticker: text("ticker").references(() => symbol.ticker),
    side: orderSideEnum("side"),
    quantity: numeric("quantity", { precision: 16, scale: 8 }),
    price: numeric("price", { precision: 20, scale: 10 }),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("transaction_trading_account_id_idx").on(table.tradingAccountId),
    index("transaction_order_id_idx").on(table.orderId),
    index("transaction_ticker_idx").on(table.ticker),
    index("transaction_created_at_idx").on(table.createdAt),
    // Composite index matching the dominant `WHERE trading_account_id = $1
    // ORDER BY created_at DESC LIMIT N OFFSET M` pattern in list_transactions
    // and the per-account fan-out walk in getAllTransactions.
    index("transaction_account_created_idx").on(
      table.tradingAccountId,
      table.createdAt.desc(),
    ),
    // Trade-kind transactions must retain the columns that became nullable
    // when deposit/withdrawal kinds were added in 0005_fat_nemesis.sql.
    // Mirrors the SQL constraint from 0008_transaction_trade_columns_check.sql
    // and the CheckConstraint on the SQLAlchemy Transaction model.
    check(
      "transaction_trade_columns_required_check",
      sql`${table.kind} <> 'trade' OR (${table.orderId} IS NOT NULL AND ${table.ticker} IS NOT NULL AND ${table.side} IS NOT NULL AND ${table.quantity} IS NOT NULL AND ${table.price} IS NOT NULL)`,
    ),
  ],
);

export const holding = pgTable(
  "holding",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker),
    assetClass: assetClassEnum("asset_class").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    reservedQuantity: numeric("reserved_quantity", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    averageCost: numeric("average_cost", { precision: 20, scale: 10 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("holding_account_ticker_idx").on(
      table.tradingAccountId,
      table.ticker,
    ),
    index("holding_trading_account_id_idx").on(table.tradingAccountId),
    index("holding_ticker_idx").on(table.ticker),
  ],
);

export const watchlistItem = pgTable(
  "watchlist_item",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("watchlist_item_user_ticker_idx").on(
      table.userId,
      table.ticker,
    ),
    index("watchlist_item_user_id_idx").on(table.userId),
    index("watchlist_item_ticker_idx").on(table.ticker),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  accountMemberships: many(accountMember),
  watchlistItems: many(watchlistItem),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const tradingAccountRelations = relations(
  tradingAccount,
  ({ many }) => ({
    members: many(accountMember),
    orders: many(order),
    transactions: many(transaction),
    holdings: many(holding),
  }),
);

export const accountMemberRelations = relations(accountMember, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [accountMember.accountId],
    references: [tradingAccount.id],
  }),
  user: one(user, { fields: [accountMember.userId], references: [user.id] }),
}));

export const symbolRelations = relations(symbol, ({ one, many }) => ({
  company: one(company),
  quote: one(quote),
  dailyBars: many(dailyBar),
  orders: many(order),
  transactions: many(transaction),
  holdings: many(holding),
  watchlistItems: many(watchlistItem),
}));

export const companyRelations = relations(company, ({ one }) => ({
  symbol: one(symbol, { fields: [company.ticker], references: [symbol.ticker] }),
}));

export const quoteRelations = relations(quote, ({ one }) => ({
  symbol: one(symbol, { fields: [quote.ticker], references: [symbol.ticker] }),
}));

export const dailyBarRelations = relations(dailyBar, ({ one }) => ({
  symbol: one(symbol, {
    fields: [dailyBar.ticker],
    references: [symbol.ticker],
  }),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [order.tradingAccountId],
    references: [tradingAccount.id],
  }),
  symbol: one(symbol, { fields: [order.ticker], references: [symbol.ticker] }),
  transactions: many(transaction),
}));

export const transactionRelations = relations(transaction, ({ one }) => ({
  order: one(order, { fields: [transaction.orderId], references: [order.id] }),
  tradingAccount: one(tradingAccount, {
    fields: [transaction.tradingAccountId],
    references: [tradingAccount.id],
  }),
  symbol: one(symbol, {
    fields: [transaction.ticker],
    references: [symbol.ticker],
  }),
}));

export const holdingRelations = relations(holding, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [holding.tradingAccountId],
    references: [tradingAccount.id],
  }),
  symbol: one(symbol, {
    fields: [holding.ticker],
    references: [symbol.ticker],
  }),
}));

export const watchlistItemRelations = relations(watchlistItem, ({ one }) => ({
  user: one(user, { fields: [watchlistItem.userId], references: [user.id] }),
  symbol: one(symbol, {
    fields: [watchlistItem.ticker],
    references: [symbol.ticker],
  }),
}));
