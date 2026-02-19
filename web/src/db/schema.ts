/**
 * Drizzle schema — single source of truth for all database tables.
 *
 * Better Auth tables: user, session, account, verification, jwks
 * Application tables: quotes
 *
 * Python services (SQLAlchemy) use models.py as a read/write mapping
 * against the tables defined here. Migrations are handled by Drizzle only.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth tables
// ---------------------------------------------------------------------------

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
  (t) => [index("session_userId_idx").on(t.userId)],
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
  (t) => [index("account_userId_idx").on(t.userId)],
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
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Better Auth relations (required for experimental joins)
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

/**
 * Cached stock quotes — written by the Python persistence gRPC service,
 * read by both Python (SQLAlchemy) and Next.js (Drizzle).
 *
 * Column names use snake_case to match the Python SQLAlchemy model.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol").notNull(),
    price: doublePrecision("price").notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    volume: doublePrecision("volume"),
    change: doublePrecision("change"),
    changePercent: doublePrecision("change_percent"),
    source: varchar("source"),
    timestamp: integer("timestamp"),
    name: varchar("name"),
    exchange: varchar("exchange"),
    currency: varchar("currency"),
    previousClose: doublePrecision("previous_close"),
    isMarketOpen: boolean("is_market_open"),
    averageVolume: doublePrecision("average_volume"),
    fiftyTwoWeekLow: doublePrecision("fifty_two_week_low"),
    fiftyTwoWeekHigh: doublePrecision("fifty_two_week_high"),
    dayRangePct: doublePrecision("day_range_pct"),
    fiftyTwoWeekPct: doublePrecision("fifty_two_week_pct"),
    gapPct: doublePrecision("gap_pct"),
    volumeRatio: doublePrecision("volume_ratio"),
    intradayRangePct: doublePrecision("intraday_range_pct"),
    signal: varchar("signal"),
    example: varchar("example"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("quotes_symbol_idx").on(t.symbol)],
);
