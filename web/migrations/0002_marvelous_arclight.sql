ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "reserved_per_share" numeric(14, 6);--> statement-breakpoint
ALTER TABLE "trading_account" ADD COLUMN IF NOT EXISTS "reserved_balance" numeric(14, 2) DEFAULT '0' NOT NULL;
