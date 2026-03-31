ALTER TABLE "order" ADD COLUMN "reserved_per_share" numeric(14, 6);--> statement-breakpoint
ALTER TABLE "trading_account" ADD COLUMN "reserved_balance" numeric(14, 2) DEFAULT '0' NOT NULL;