CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "symbol_name_trgm_idx" ON "symbol" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "symbol_ticker_pattern_idx" ON "symbol" ("ticker" text_pattern_ops);
