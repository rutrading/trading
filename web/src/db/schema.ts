import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgView,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", [
  "investment",
  "crypto",
  "kalshi",
]);

export const experienceLevelEnum = pgEnum("experience_level", [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
]);

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

export const strategyTypeEnum = pgEnum("strategy_type", [
  "ema_crossover",
  "sma_crossover",
  "rsi_reversion",
  "donchian_breakout",
]);

export const strategyStatusEnum = pgEnum("strategy_status", [
  "active",
  "paused",
  "disabled",
]);

export const strategySignalEnum = pgEnum("strategy_signal", [
  "buy",
  "sell",
  "hold",
]);

export const strategyActionEnum = pgEnum("strategy_action", [
  "place_buy",
  "place_sell",
  "none",
]);

// Kalshi uses one-L "canceled", intentionally distinct from the equities
// order_status enum's two-L "cancelled" - both must round-trip from external
// APIs, so they cannot be unified.
export const kalshiOrderSideEnum = pgEnum("kalshi_order_side", ["yes", "no"]);
export const kalshiOrderActionEnum = pgEnum("kalshi_order_action", ["buy", "sell"]);
export const kalshiOrderStatusEnum = pgEnum("kalshi_order_status", [
  "pending",
  "resting",
  "executed",
  "canceled",
  "rejected",
]);
export const kalshiOrderTypeEnum = pgEnum("kalshi_order_type", ["limit", "market"]);
export const kalshiAccountStatusEnum = pgEnum("kalshi_account_status", [
  "local_only",
  "active",
  "failed",
]);
export const kalshiSignalDecisionEnum = pgEnum("kalshi_signal_decision", [
  "emitted",
  "skipped",
  "dry_run",
  "blocked",
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
    experienceLevel: experienceLevelEnum("experience_level")
      .notNull()
      .default("beginner"),
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
    index("symbol_name_trgm_idx").using(
      "gin",
      sql`${table.name} gin_trgm_ops`,
    ),
    index("symbol_ticker_pattern_idx").using(
      "btree",
      sql`${table.ticker} text_pattern_ops`,
    ),
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

export const strategy = pgTable(
  "strategy",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    strategyType: strategyTypeEnum("strategy_type").notNull().default("ema_crossover"),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker),
    symbolsJson: jsonb("symbols_json").$type<string[]>().notNull().default([]),
    timeframe: text("timeframe").notNull().default("1Day"),
    capitalAllocation: numeric("capital_allocation", { precision: 14, scale: 2 })
      .notNull()
      .default("10000"),
    paramsJson: jsonb("params_json").$type<Record<string, unknown>>().notNull(),
    riskJson: jsonb("risk_json").$type<Record<string, unknown>>().notNull().default({}),
    status: strategyStatusEnum("status").notNull().default("active"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSignalAt: timestamp("last_signal_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("strategy_trading_account_id_idx").on(table.tradingAccountId),
    index("strategy_ticker_idx").on(table.ticker),
    index("strategy_status_idx").on(table.status),
    uniqueIndex("strategy_account_type_ticker_idx").on(
      table.tradingAccountId,
      table.strategyType,
      table.ticker,
    ),
  ],
);

export const strategyRun = pgTable(
  "strategy_run",
  {
    id: serial("id").primaryKey(),
    strategyId: integer("strategy_id")
      .notNull()
      .references(() => strategy.id, { onDelete: "cascade" }),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    signal: strategySignalEnum("signal").notNull().default("hold"),
    action: strategyActionEnum("action").notNull().default("none"),
    reason: text("reason").notNull(),
    inputsJson: jsonb("inputs_json").$type<Record<string, unknown>>().notNull(),
    orderId: integer("order_id").references(() => order.id, { onDelete: "set null" }),
    error: text("error"),
  },
  (table) => [
    index("strategy_run_strategy_id_idx").on(table.strategyId),
    index("strategy_run_trading_account_id_idx").on(table.tradingAccountId),
    index("strategy_run_run_at_idx").on(table.runAt),
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
    // when deposit/withdrawal kinds were added. Mirrors the SQL constraint
    // emitted in 0007_cheerful_human_robot.sql and the CheckConstraint on
    // the SQLAlchemy Transaction model.
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
    strategies: many(strategy),
    strategyRuns: many(strategyRun),
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
  strategies: many(strategy),
  strategyRuns: many(strategyRun),
  orders: many(order),
  transactions: many(transaction),
  holdings: many(holding),
  watchlistItems: many(watchlistItem),
}));

export const strategyRelations = relations(strategy, ({ one, many }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [strategy.tradingAccountId],
    references: [tradingAccount.id],
  }),
  symbol: one(symbol, { fields: [strategy.ticker], references: [symbol.ticker] }),
  runs: many(strategyRun),
}));

export const strategyRunRelations = relations(strategyRun, ({ one }) => ({
  strategy: one(strategy, {
    fields: [strategyRun.strategyId],
    references: [strategy.id],
  }),
  tradingAccount: one(tradingAccount, {
    fields: [strategyRun.tradingAccountId],
    references: [tradingAccount.id],
  }),
  symbol: one(symbol, {
    fields: [strategyRun.ticker],
    references: [symbol.ticker],
  }),
  order: one(order, { fields: [strategyRun.orderId], references: [order.id] }),
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

export const kalshiAccount = pgTable(
  "kalshi_account",
  {
    tradingAccountId: integer("trading_account_id")
      .primaryKey()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    subaccountNumber: integer("subaccount_number"),
    status: kalshiAccountStatusEnum("status").notNull().default("local_only"),
    provisioningError: text("provisioning_error"),
    lastBalanceDollars: numeric("last_balance_dollars", { precision: 18, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("kalshi_account_subaccount_number_idx")
      .on(table.subaccountNumber)
      .where(sql`${table.subaccountNumber} IS NOT NULL`),
    check(
      "kalshi_account_subaccount_number_range_check",
      sql`${table.subaccountNumber} IS NULL OR (${table.subaccountNumber} BETWEEN 1 AND 32)`,
    ),
  ],
);

export const kalshiMarket = pgTable(
  "kalshi_market",
  {
    ticker: text("ticker").primaryKey(),
    eventTicker: text("event_ticker"),
    seriesTicker: text("series_ticker").notNull(),
    marketType: text("market_type"),
    title: text("title"),
    yesSubTitle: text("yes_sub_title"),
    noSubTitle: text("no_sub_title"),
    strikeType: text("strike_type"),
    floorStrike: numeric("floor_strike", { precision: 20, scale: 6 }),
    capStrike: numeric("cap_strike", { precision: 20, scale: 6 }),
    openTime: timestamp("open_time", { withTimezone: true }),
    closeTime: timestamp("close_time", { withTimezone: true }),
    latestExpirationTime: timestamp("latest_expiration_time", {
      withTimezone: true,
    }),
    status: text("status"),
    priceLevelStructure: text("price_level_structure"),
    priceRanges: jsonb("price_ranges"),
    fractionalTradingEnabled: boolean("fractional_trading_enabled")
      .notNull()
      .default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("kalshi_market_series_ticker_idx").on(table.seriesTicker),
    index("kalshi_market_close_time_idx").on(table.closeTime),
    index("kalshi_market_status_idx").on(table.status),
  ],
);

export const kalshiSignal = pgTable(
  "kalshi_signal",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    marketTicker: text("market_ticker").references(() => kalshiMarket.ticker),
    strategy: text("strategy").notNull(),
    side: kalshiOrderSideEnum("side"),
    action: kalshiOrderActionEnum("action"),
    countFp: numeric("count_fp", { precision: 18, scale: 2 }),
    limitPriceDollars: numeric("limit_price_dollars", { precision: 18, scale: 6 }),
    decision: kalshiSignalDecisionEnum("decision").notNull(),
    reason: text("reason"),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("kalshi_signal_account_created_idx").on(
      table.tradingAccountId,
      table.createdAt.desc(),
    ),
    index("kalshi_signal_decision_idx").on(table.decision),
  ],
);

export const kalshiOrder = pgTable(
  "kalshi_order",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    subaccountNumber: integer("subaccount_number"),
    kalshiOrderId: text("kalshi_order_id").unique(),
    clientOrderId: text("client_order_id").notNull().unique(),
    marketTicker: text("market_ticker")
      .notNull()
      .references(() => kalshiMarket.ticker),
    side: kalshiOrderSideEnum("side").notNull(),
    action: kalshiOrderActionEnum("action").notNull(),
    orderType: kalshiOrderTypeEnum("order_type").notNull(),
    timeInForce: text("time_in_force").notNull().default("immediate_or_cancel"),
    countFp: numeric("count_fp", { precision: 18, scale: 2 }).notNull(),
    limitPriceDollars: numeric("limit_price_dollars", { precision: 18, scale: 6 }),
    status: kalshiOrderStatusEnum("status").notNull(),
    strategy: text("strategy").notNull(),
    signalId: integer("signal_id").references(() => kalshiSignal.id),
    fillCountFp: numeric("fill_count_fp", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    remainingCountFp: numeric("remaining_count_fp", { precision: 18, scale: 2 }),
    rejectionReason: text("rejection_reason"),
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("kalshi_order_account_created_idx").on(
      table.tradingAccountId,
      table.createdAt.desc(),
    ),
    index("kalshi_order_account_status_idx").on(
      table.tradingAccountId,
      table.status,
    ),
    index("kalshi_order_market_ticker_idx").on(table.marketTicker),
  ],
);

export const kalshiPosition = pgTable(
  "kalshi_position",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    subaccountNumber: integer("subaccount_number"),
    marketTicker: text("market_ticker")
      .notNull()
      .references(() => kalshiMarket.ticker),
    positionFp: numeric("position_fp", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    totalTradedDollars: numeric("total_traded_dollars", {
      precision: 18,
      scale: 6,
    })
      .notNull()
      .default("0"),
    marketExposureDollars: numeric("market_exposure_dollars", {
      precision: 18,
      scale: 6,
    })
      .notNull()
      .default("0"),
    realizedPnlDollars: numeric("realized_pnl_dollars", {
      precision: 18,
      scale: 6,
    })
      .notNull()
      .default("0"),
    feesPaidDollars: numeric("fees_paid_dollars", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    rawResponse: jsonb("raw_response"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("kalshi_position_account_market_idx").on(
      table.tradingAccountId,
      table.marketTicker,
    ),
  ],
);

export const kalshiFill = pgTable(
  "kalshi_fill",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    subaccountNumber: integer("subaccount_number"),
    kalshiFillId: text("kalshi_fill_id").notNull().unique(),
    kalshiTradeId: text("kalshi_trade_id"),
    kalshiOrderId: text("kalshi_order_id"),
    localOrderId: integer("local_order_id").references(() => kalshiOrder.id),
    marketTicker: text("market_ticker")
      .notNull()
      .references(() => kalshiMarket.ticker),
    side: kalshiOrderSideEnum("side").notNull(),
    action: kalshiOrderActionEnum("action").notNull(),
    countFp: numeric("count_fp", { precision: 18, scale: 2 }).notNull(),
    yesPriceDollars: numeric("yes_price_dollars", { precision: 18, scale: 6 }),
    noPriceDollars: numeric("no_price_dollars", { precision: 18, scale: 6 }),
    feeDollars: numeric("fee_dollars", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    isTaker: boolean("is_taker"),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("kalshi_fill_trading_account_id_idx").on(table.tradingAccountId),
    index("kalshi_fill_market_ticker_idx").on(table.marketTicker),
    index("kalshi_fill_kalshi_order_id_idx").on(table.kalshiOrderId),
    index("kalshi_fill_executed_at_idx").on(table.executedAt),
  ],
);

export const kalshiBotState = pgTable("kalshi_bot_state", {
  tradingAccountId: integer("trading_account_id")
    .primaryKey()
    .references(() => tradingAccount.id, { onDelete: "cascade" }),
  activeStrategy: text("active_strategy").notNull().default("threshold_drift"),
  automationEnabled: boolean("automation_enabled").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  dryRun: boolean("dry_run").notNull().default(true),
  maxOrdersPerCycle: integer("max_orders_per_cycle").notNull().default(1),
  maxOpenContracts: integer("max_open_contracts").notNull().default(5),
  lastCycleAt: timestamp("last_cycle_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const kalshiAccountRelations = relations(kalshiAccount, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [kalshiAccount.tradingAccountId],
    references: [tradingAccount.id],
  }),
  user: one(user, {
    fields: [kalshiAccount.userId],
    references: [user.id],
  }),
}));

export const kalshiMarketRelations = relations(kalshiMarket, ({ many }) => ({
  signals: many(kalshiSignal),
  orders: many(kalshiOrder),
  positions: many(kalshiPosition),
  fills: many(kalshiFill),
}));

export const kalshiSignalRelations = relations(kalshiSignal, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [kalshiSignal.tradingAccountId],
    references: [tradingAccount.id],
  }),
  market: one(kalshiMarket, {
    fields: [kalshiSignal.marketTicker],
    references: [kalshiMarket.ticker],
  }),
}));

export const kalshiOrderRelations = relations(kalshiOrder, ({ one, many }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [kalshiOrder.tradingAccountId],
    references: [tradingAccount.id],
  }),
  market: one(kalshiMarket, {
    fields: [kalshiOrder.marketTicker],
    references: [kalshiMarket.ticker],
  }),
  signal: one(kalshiSignal, {
    fields: [kalshiOrder.signalId],
    references: [kalshiSignal.id],
  }),
  fills: many(kalshiFill),
}));

export const kalshiPositionRelations = relations(kalshiPosition, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [kalshiPosition.tradingAccountId],
    references: [tradingAccount.id],
  }),
  market: one(kalshiMarket, {
    fields: [kalshiPosition.marketTicker],
    references: [kalshiMarket.ticker],
  }),
}));

export const kalshiFillRelations = relations(kalshiFill, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [kalshiFill.tradingAccountId],
    references: [tradingAccount.id],
  }),
  market: one(kalshiMarket, {
    fields: [kalshiFill.marketTicker],
    references: [kalshiMarket.ticker],
  }),
  localOrder: one(kalshiOrder, {
    fields: [kalshiFill.localOrderId],
    references: [kalshiOrder.id],
  }),
}));

export const kalshiBotStateRelations = relations(kalshiBotState, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [kalshiBotState.tradingAccountId],
    references: [tradingAccount.id],
  }),
}));

export const newsArticle  = pgTable("news_article", {
  article_id: serial("article_id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  summary: text("summary"),
  thumbnail: text("thumbnail"),
  date_published: timestamp("date_published", { withTimezone: true }).notNull().defaultNow(),
});

export const author  = pgTable("author", {
  author_id: serial("author_id").primaryKey(),
  article_id: integer("article_id").notNull().references(() => newsArticle.article_id),
  author_name: text("author_name").notNull(),
});

export const newsSource  = pgTable("news_source", {
  news_source_id: serial("news_source_id").primaryKey(),
  source_name: text("source_name").notNull().unique(),
});

export const newsSourceBridge  = pgTable("news_article_source_bridge", {
  id: serial("id").primaryKey(),
  news_source_id: integer("news_source_id").notNull().references(() => newsSource.news_source_id, { onDelete: "cascade" }),
  article_id: integer("article_id").notNull().references(() => newsArticle.article_id, { onDelete: "cascade" })
});

export const articleStockTicker  = pgTable("article_stock_ticker", {
  ticker_id: serial("ticker_id").primaryKey(),
  ticker: text("ticker").notNull(),
});

export const newsArticleTickerBridge  = pgTable("news_article_ticker_bridge", {
  id: serial("id").primaryKey(),
  article_id: integer("article_id").notNull().references(() => newsArticle.article_id, { onDelete: "cascade" }),
  ticker_id: integer("ticker_id").notNull().references(() => articleStockTicker.ticker_id, { onDelete: "cascade" }),
});

export const articleSummaryView = pgView("article_summary_view", {
  article_id: integer("article_id"),
  title: text("title"),
  url: text("url"),
  summary: text("summary"),
  thumbnail: text("thumbnail"),
  date_published: timestamp("date_published", { withTimezone: true }),
  source_name: text("source_name"),
  authors: text("authors"),
  tickers: text("tickers"),
}).as(sql`
  SELECT 
    ${newsArticle.article_id} as article_id, 
    ${newsArticle.title} as title,
    ${newsArticle.url} as url,
    ${newsArticle.summary} as summary,
    ${newsArticle.thumbnail} as thumbnail,
    ${newsArticle.date_published} as date_published,
    ${newsSource.source_name} as source_name,
    (SELECT STRING_AGG(${author.author_name}, ', ') 
        FROM ${author} 
        WHERE ${newsArticle.article_id} = ${author.article_id}
    ) AS authors,
    (
        SELECT STRING_AGG(${articleStockTicker.ticker}, ', ') 
        FROM ${articleStockTicker} 
		    join ${newsArticleTickerBridge} on (${newsArticle.article_id} = ${newsArticleTickerBridge.article_id})
        WHERE ${newsArticleTickerBridge.ticker_id} = ${articleStockTicker.ticker_id}
    ) AS tickers
  FROM ${newsArticle}
  LEFT JOIN ${newsSourceBridge} ON ${newsArticle.article_id} = ${newsSourceBridge.article_id}
  LEFT JOIN ${newsSource} ON ${newsSourceBridge.news_source_id} = ${newsSource.news_source_id}
  ORDER BY ${newsArticle.date_published} DESC
`);
