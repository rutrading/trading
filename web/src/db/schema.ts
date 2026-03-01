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
// "buy" = purchasing shares, "sell" = selling shares you own
export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);
// "market" = execute now at current price, "limit" = only execute at your price or better
export const orderTypeEnum = pgEnum("order_type", ["market", "limit"]);
// "day" = expires at market close, "gtc" = stays open up to 90 days
export const timeInForceEnum = pgEnum("time_in_force", ["day", "gtc"]);
// which provider this data came from
export const dataSourceEnum = pgEnum("data_source", ["twelvedata", "massive", "alpaca"]);
export const orderStatusEnum = pgEnum("order_status", [
  "filled",
  "pending",
  "cancelled",
  "expired",
]);

export const user = pgTable("user", {
  // better auth generated id
  id: text("id").primaryKey(),
  // display name, e.g. "Kyle"
  name: text("name").notNull(),
  // login email, must be unique
  email: text("email").notNull().unique(),
  // whether the user has verified their email
  emailVerified: boolean("emailVerified").notNull().default(false),
  // profile picture url
  image: text("image"),
  // paper trading cash balance, set during onboarding (e.g. 100000.00 for beginner)
  balance: numeric("balance", { precision: 14, scale: 2 }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    // when this session expires and the user must log in again
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    // unique session token sent in cookies
    token: text("token").notNull().unique(),
    // ip address of the client that created this session
    ipAddress: text("ipAddress"),
    // browser user agent string, e.g. "Mozilla/5.0 ..."
    userAgent: text("userAgent"),
    // which user this session belongs to
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
    // provider-specific account id
    accountId: text("accountId").notNull(),
    // auth provider name, e.g. "google", "github", "credential"
    providerId: text("providerId").notNull(),
    // which user this auth account belongs to
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // oauth access token
    accessToken: text("accessToken"),
    // oauth refresh token for getting new access tokens
    refreshToken: text("refreshToken"),
    // openid connect id token
    idToken: text("idToken"),
    // when the access token expires
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    // when the refresh token expires
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    // oauth scopes granted, e.g. "openid email profile"
    scope: text("scope"),
    // hashed password for credential-based auth
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
    // what is being verified, e.g. an email address
    identifier: text("identifier").notNull(),
    // the verification code or token
    value: text("value").notNull(),
    // when this verification link/code expires
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
  // rsa/ec public key used to verify jwt signatures
  publicKey: text("publicKey").notNull(),
  // rsa/ec private key used to sign jwts
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  // when this key pair should be rotated out
  expiresAt: timestamp("expiresAt", { withTimezone: true }),
});

export const symbol = pgTable("symbol", {
  id: serial("id").primaryKey(),
  // stock or crypto ticker, e.g. "AAPL" or "BTC/USD"
  ticker: varchar("ticker").notNull().unique(),
  // full name, e.g. "Apple Inc." for stocks or "Bitcoin" for crypto
  name: text("name").notNull(),
  // whether this is a stock or crypto asset
  type: symbolTypeEnum("type").notNull(),
  // exchange where it trades, e.g. "NASDAQ" (null for crypto)
  exchange: text("exchange"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const portfolio = pgTable(
  "portfolio",
  {
    id: serial("id").primaryKey(),
    // which user owns this position
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // which stock/crypto this position is for
    symbolId: integer("symbol_id")
      .notNull()
      .references(() => symbol.id),
    // how many shares the user currently holds
    quantity: integer("quantity").notNull().default(0),
    // weighted average purchase price per share, recalculated on each buy
    averageCost: numeric("average_cost", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    // true if the user once held this stock but sold all shares
    previouslyHeld: boolean("previously_held").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("portfolio_userId_idx").on(table.userId),
    index("portfolio_symbolId_idx").on(table.symbolId),
    index("portfolio_user_symbol_idx").on(table.userId, table.symbolId),
  ],
);

export const order = pgTable(
  "order",
  {
    id: serial("id").primaryKey(),
    // which user placed this order
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // which stock/crypto the order is for
    symbolId: integer("symbol_id")
      .notNull()
      .references(() => symbol.id),
    // "buy" or "sell"
    side: orderSideEnum("side").notNull(),
    // "market" fills immediately, "limit" waits for your target price
    type: orderTypeEnum("type").notNull(),
    // how long the order stays open (only applies to limit orders)
    timeInForce: timeInForceEnum("time_in_force").notNull().default("day"),
    // number of shares in this order
    quantity: integer("quantity").notNull(),
    // price per share (fill price for market, target price for limit)
    price: numeric("price", { precision: 14, scale: 4 }).notNull(),
    // total cost of the order, e.g. 10 shares * $150.00 = $1500.00
    total: numeric("total", { precision: 14, scale: 4 }).notNull(),
    // "filled" = complete, "pending" = waiting, "cancelled" or "expired"
    status: orderStatusEnum("status").notNull().default("filled"),
    // when the order was actually executed
    filledAt: timestamp("filled_at", { withTimezone: true }),
    // when a pending limit order expires if not filled
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("order_userId_idx").on(table.userId),
    index("order_symbolId_idx").on(table.symbolId),
    index("order_status_idx").on(table.status),
  ],
);

export const quote = pgTable(
  "quote",
  {
    id: serial("id").primaryKey(),
    // which symbol this quote is for (one row per symbol, overwritten each poll)
    symbolId: integer("symbol_id")
      .notNull()
      .references(() => symbol.id)
      .unique(),
    // latest trade price, e.g. 187.44
    price: doublePrecision("price").notNull(),
    // opening price for the current trading day
    open: doublePrecision("open"),
    // highest price reached today
    high: doublePrecision("high"),
    // lowest price reached today
    low: doublePrecision("low"),
    // number of shares traded today
    volume: doublePrecision("volume"),
    // dollar change from previous close, e.g. +2.35
    change: doublePrecision("change"),
    // percent change from previous close, e.g. +1.27
    changePercent: doublePrecision("change_percent"),
    // when this quote was last refreshed from the api
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("quote_symbolId_idx").on(table.symbolId)],
);

export const quoteHistory = pgTable(
  "quote_history",
  {
    id: serial("id").primaryKey(),
    // which symbol this historical data point is for
    symbolId: integer("symbol_id")
      .notNull()
      .references(() => symbol.id),
    // closing price at this point in time
    price: doublePrecision("price").notNull(),
    // opening price for this time period
    open: doublePrecision("open"),
    // highest price during this time period
    high: doublePrecision("high"),
    // lowest price during this time period
    low: doublePrecision("low"),
    // shares traded during this time period
    volume: doublePrecision("volume"),
    // when this data point was recorded
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    // which provider supplied this data point
    source: dataSourceEnum("source").notNull(),
  },
  (table) => [
    index("quoteHistory_symbolId_idx").on(table.symbolId),
    index("quoteHistory_timestamp_idx").on(table.timestamp),
    index("quoteHistory_symbol_timestamp_idx").on(table.symbolId, table.timestamp),
  ],
);

export const watchlist = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    // which user added this to their watchlist
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // which stock/crypto they are watching
    symbolId: integer("symbol_id")
      .notNull()
      .references(() => symbol.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("watchlist_userId_idx").on(table.userId),
    index("watchlist_user_symbol_idx").on(table.userId, table.symbolId),
  ],
);

// export const news = pgTable(
//   "news",
//   {
//     id: serial("id").primaryKey(),
//     // related symbol (null for general market news)
//     symbolId: integer("symbol_id").references(() => symbol.id),
//     // article headline, e.g. "Apple Reports Record Q4 Earnings"
//     headline: text("headline").notNull(),
//     // short description of the article
//     summary: text("summary"),
//     // publisher name, e.g. "Reuters"
//     source: text("source").notNull(),
//     // link to the full article
//     url: text("url").notNull(),
//     // when the article was originally published
//     publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
//     createdAt: timestamp("created_at", { withTimezone: true })
//       .notNull()
//       .defaultNow(),
//   },
//   (t) => [
//     index("news_symbolId_idx").on(t.symbolId),
//     index("news_publishedAt_idx").on(t.publishedAt),
//   ],
// );

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  portfolios: many(portfolio),
  orders: many(order),
  watchlists: many(watchlist),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const symbolRelations = relations(symbol, ({ one, many }) => ({
  quote: one(quote, { fields: [symbol.id], references: [quote.symbolId] }),
  quoteHistory: many(quoteHistory),
  portfolios: many(portfolio),
  orders: many(order),
  watchlists: many(watchlist),
}));

export const portfolioRelations = relations(portfolio, ({ one }) => ({
  user: one(user, { fields: [portfolio.userId], references: [user.id] }),
  symbol: one(symbol, {
    fields: [portfolio.symbolId],
    references: [symbol.id],
  }),
}));

export const orderRelations = relations(order, ({ one }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  symbol: one(symbol, { fields: [order.symbolId], references: [symbol.id] }),
}));

export const quoteRelations = relations(quote, ({ one }) => ({
  symbol: one(symbol, { fields: [quote.symbolId], references: [symbol.id] }),
}));

export const quoteHistoryRelations = relations(quoteHistory, ({ one }) => ({
  symbol: one(symbol, {
    fields: [quoteHistory.symbolId],
    references: [symbol.id],
  }),
}));

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  user: one(user, { fields: [watchlist.userId], references: [user.id] }),
  symbol: one(symbol, {
    fields: [watchlist.symbolId],
    references: [symbol.id],
  }),
}));

// export const newsRelations = relations(news, ({ one }) => ({
//   symbol: one(symbol, { fields: [news.symbolId], references: [symbol.id] }),
// }));
