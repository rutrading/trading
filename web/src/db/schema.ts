import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  PgInteger,
  pgView,
  pgTable,
  QueryBuilder,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { article } from "motion/react-client";

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
    limitPrice: numeric("limit_price", { precision: 14, scale: 2 }),
    stopPrice: numeric("stop_price", { precision: 14, scale: 2 }),
    filledQuantity: numeric("filled_quantity", { precision: 16, scale: 8 })
      .notNull()
      .default("0"),
    averageFillPrice: numeric("average_fill_price", {
      precision: 14,
      scale: 2,
    }),
    status: orderStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reservedPerShare: numeric("reserved_per_share", { precision: 14, scale: 6 }),
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
  ],
);

export const transaction = pgTable(
  "transaction",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    ticker: text("ticker")
      .notNull()
      .references(() => symbol.ticker),
    side: orderSideEnum("side").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 8 }).notNull(),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
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
    averageCost: numeric("average_cost", { precision: 14, scale: 2 })
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

const qb = new QueryBuilder();

export const articleSummaryView = pgView("article_summary_view", {
  article_id: integer("article_id"),
  url: text("url"),
  summary: text("summary"),
  thumbnail: text("thumbnail"),
  date_published: timestamp("date_published", { withTimezone: true }),
  source_name: text("source_name"),
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

