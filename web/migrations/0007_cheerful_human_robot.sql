DO $$ BEGIN CREATE TYPE "public"."transaction_kind" AS ENUM('trade', 'deposit', 'withdrawal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "holding" ALTER COLUMN "average_cost" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "holding" ALTER COLUMN "average_cost" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "limit_price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "stop_price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "average_fill_price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "reserved_per_share" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "ticker" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "side" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "reference_price" numeric(20, 10);--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "kind" "transaction_kind" DEFAULT 'trade' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_account_created_idx" ON "order" USING btree ("trading_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_account_status_created_idx" ON "order" USING btree ("trading_account_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "symbol_name_trgm_idx" ON "symbol" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "symbol_ticker_pattern_idx" ON "symbol" USING btree ("ticker" text_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_account_created_idx" ON "transaction" USING btree ("trading_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "transaction" ADD CONSTRAINT "transaction_trade_columns_required_check" CHECK ("transaction"."kind" <> 'trade' OR ("transaction"."order_id" IS NOT NULL AND "transaction"."ticker" IS NOT NULL AND "transaction"."side" IS NOT NULL AND "transaction"."quantity" IS NOT NULL AND "transaction"."price" IS NOT NULL)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- Backfill a synthetic initial-deposit transaction for every existing
-- account so the new "Balance After" column starts from zero instead of the
-- implicit starting-balance floor. Reconstruct the initial balance from the
-- current balance and the net effect of existing trades:
--   initial = current_balance + sum(buys) - sum(sells)
INSERT INTO "transaction" ("kind", "trading_account_id", "total", "created_at")
SELECT
  'deposit',
  ta.id,
  ta.balance + COALESCE(buys.total, 0) - COALESCE(sells.total, 0),
  ta.created_at
FROM "trading_account" ta
LEFT JOIN (
  SELECT trading_account_id, SUM(total) AS total
  FROM "transaction"
  WHERE side = 'buy' AND kind = 'trade'
  GROUP BY trading_account_id
) buys ON buys.trading_account_id = ta.id
LEFT JOIN (
  SELECT trading_account_id, SUM(total) AS total
  FROM "transaction"
  WHERE side = 'sell' AND kind = 'trade'
  GROUP BY trading_account_id
) sells ON sells.trading_account_id = ta.id
WHERE NOT EXISTS (
  SELECT 1 FROM "transaction" t
  WHERE t.trading_account_id = ta.id AND t.kind = 'deposit'
);