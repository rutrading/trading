import { relations } from "drizzle-orm";
import {
  boolean,
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
export const assetTypeEnum = pgEnum("asset_type", ["stock", "etf", "crypto"]);
export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);
export const orderTypeEnum = pgEnum("order_type", [
  "market",
  "limit",
  "stop",
  "stop_limit",
]);
export const timeInForceEnum = pgEnum("time_in_force", ["day", "gtc"]);
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

export const order = pgTable(
  "order",
  {
    id: serial("id").primaryKey(),
    tradingAccountId: integer("trading_account_id")
      .notNull()
      .references(() => tradingAccount.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    assetType: assetTypeEnum("asset_type").notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("order_trading_account_id_idx").on(table.tradingAccountId),
    index("order_symbol_idx").on(table.symbol),
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
    symbol: text("symbol").notNull(),
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
    symbol: text("symbol").notNull(),
    assetType: assetTypeEnum("asset_type").notNull(),
    quantity: numeric("quantity", { precision: 16, scale: 8 })
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
    uniqueIndex("holding_account_symbol_idx").on(
      table.tradingAccountId,
      table.symbol,
    ),
    index("holding_trading_account_id_idx").on(table.tradingAccountId),
  ],
);

export const watchlistItem = pgTable(
  "watchlist_item",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("watchlist_item_user_symbol_idx").on(
      table.userId,
      table.symbol,
    ),
    index("watchlist_item_user_id_idx").on(table.userId),
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

export const orderRelations = relations(order, ({ one, many }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [order.tradingAccountId],
    references: [tradingAccount.id],
  }),
  transactions: many(transaction),
}));

export const transactionRelations = relations(transaction, ({ one }) => ({
  order: one(order, { fields: [transaction.orderId], references: [order.id] }),
  tradingAccount: one(tradingAccount, {
    fields: [transaction.tradingAccountId],
    references: [tradingAccount.id],
  }),
}));

export const holdingRelations = relations(holding, ({ one }) => ({
  tradingAccount: one(tradingAccount, {
    fields: [holding.tradingAccountId],
    references: [tradingAccount.id],
  }),
}));

export const watchlistItemRelations = relations(watchlistItem, ({ one }) => ({
  user: one(user, { fields: [watchlistItem.userId], references: [user.id] }),
}));
