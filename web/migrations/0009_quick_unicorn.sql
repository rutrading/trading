-- Composite indexes for the dominant `WHERE trading_account_id = $1
-- [AND status = $2] ORDER BY created_at DESC LIMIT N OFFSET M` queries
-- in list_orders / list_transactions and the per-account fan-out walk
-- in getAllTransactions. The planner can now serve these via an
-- in-order index walk and stop after N rows, replacing the previous
-- separate-index + sort plan.
--
-- NB: the drizzle-generated diff also wanted to DROP and re-ADD
-- "transaction_trade_columns_required_check" purely because Drizzle now
-- emits qualified column references in the snapshot ("transaction"."kind"
-- vs kind). The CHECK is semantically identical — we omit the spurious
-- rewrite to avoid a non-idempotent destructive statement.
CREATE INDEX IF NOT EXISTS "order_account_created_idx" ON "order" USING btree ("trading_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_account_status_created_idx" ON "order" USING btree ("trading_account_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_account_created_idx" ON "transaction" USING btree ("trading_account_id","created_at" DESC NULLS LAST);
