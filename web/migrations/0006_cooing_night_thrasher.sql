ALTER TABLE "holding" ALTER COLUMN "average_cost" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "holding" ALTER COLUMN "average_cost" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "limit_price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "stop_price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "average_fill_price" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "reserved_per_share" SET DATA TYPE numeric(20, 10);--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "price" SET DATA TYPE numeric(20, 10);