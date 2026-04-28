DO $$ BEGIN CREATE TYPE "public"."kalshi_account_status" AS ENUM('local_only', 'active', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."kalshi_order_action" AS ENUM('buy', 'sell'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."kalshi_order_side" AS ENUM('yes', 'no'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."kalshi_order_status" AS ENUM('pending', 'resting', 'executed', 'canceled', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."kalshi_order_type" AS ENUM('limit', 'market'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."kalshi_signal_decision" AS ENUM('emitted', 'skipped', 'dry_run', 'blocked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE IF NOT EXISTS 'kalshi';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_account" (
	"trading_account_id" integer PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subaccount_number" integer,
	"status" "kalshi_account_status" DEFAULT 'local_only' NOT NULL,
	"provisioning_error" text,
	"last_balance_dollars" numeric(18, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kalshi_account_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "kalshi_account_subaccount_number_range_check" CHECK ("kalshi_account"."subaccount_number" IS NULL OR ("kalshi_account"."subaccount_number" BETWEEN 1 AND 32))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_bot_state" (
	"trading_account_id" integer PRIMARY KEY NOT NULL,
	"active_strategy" text DEFAULT 'threshold_drift' NOT NULL,
	"automation_enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"max_orders_per_cycle" integer DEFAULT 1 NOT NULL,
	"max_open_contracts" integer DEFAULT 5 NOT NULL,
	"last_cycle_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_fill" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_account_id" integer NOT NULL,
	"subaccount_number" integer,
	"kalshi_fill_id" text NOT NULL,
	"kalshi_trade_id" text,
	"kalshi_order_id" text,
	"local_order_id" integer,
	"market_ticker" text NOT NULL,
	"side" "kalshi_order_side" NOT NULL,
	"action" "kalshi_order_action" NOT NULL,
	"count_fp" numeric(18, 2) NOT NULL,
	"yes_price_dollars" numeric(18, 6),
	"no_price_dollars" numeric(18, 6),
	"fee_dollars" numeric(18, 6) DEFAULT '0' NOT NULL,
	"is_taker" boolean,
	"executed_at" timestamp with time zone NOT NULL,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kalshi_fill_kalshi_fill_id_unique" UNIQUE("kalshi_fill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_market" (
	"ticker" text PRIMARY KEY NOT NULL,
	"event_ticker" text,
	"series_ticker" text NOT NULL,
	"market_type" text,
	"title" text,
	"yes_sub_title" text,
	"no_sub_title" text,
	"strike_type" text,
	"floor_strike" numeric(20, 6),
	"cap_strike" numeric(20, 6),
	"open_time" timestamp with time zone,
	"close_time" timestamp with time zone,
	"latest_expiration_time" timestamp with time zone,
	"status" text,
	"price_level_structure" text,
	"price_ranges" jsonb,
	"fractional_trading_enabled" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_order" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_account_id" integer NOT NULL,
	"subaccount_number" integer,
	"kalshi_order_id" text,
	"client_order_id" text NOT NULL,
	"market_ticker" text NOT NULL,
	"side" "kalshi_order_side" NOT NULL,
	"action" "kalshi_order_action" NOT NULL,
	"order_type" "kalshi_order_type" NOT NULL,
	"time_in_force" text DEFAULT 'immediate_or_cancel' NOT NULL,
	"count_fp" numeric(18, 2) NOT NULL,
	"limit_price_dollars" numeric(18, 6),
	"status" "kalshi_order_status" NOT NULL,
	"strategy" text NOT NULL,
	"signal_id" integer,
	"fill_count_fp" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remaining_count_fp" numeric(18, 2),
	"rejection_reason" text,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kalshi_order_kalshi_order_id_unique" UNIQUE("kalshi_order_id"),
	CONSTRAINT "kalshi_order_client_order_id_unique" UNIQUE("client_order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_position" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_account_id" integer NOT NULL,
	"subaccount_number" integer,
	"market_ticker" text NOT NULL,
	"position_fp" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_traded_dollars" numeric(18, 6) DEFAULT '0' NOT NULL,
	"market_exposure_dollars" numeric(18, 6) DEFAULT '0' NOT NULL,
	"realized_pnl_dollars" numeric(18, 6) DEFAULT '0' NOT NULL,
	"fees_paid_dollars" numeric(18, 6) DEFAULT '0' NOT NULL,
	"raw_response" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kalshi_signal" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_account_id" integer NOT NULL,
	"market_ticker" text,
	"strategy" text NOT NULL,
	"side" "kalshi_order_side",
	"action" "kalshi_order_action",
	"count_fp" numeric(18, 2),
	"limit_price_dollars" numeric(18, 6),
	"decision" "kalshi_signal_decision" NOT NULL,
	"reason" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_account" ADD CONSTRAINT "kalshi_account_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_account" ADD CONSTRAINT "kalshi_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_bot_state" ADD CONSTRAINT "kalshi_bot_state_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_fill" ADD CONSTRAINT "kalshi_fill_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_fill" ADD CONSTRAINT "kalshi_fill_local_order_id_kalshi_order_id_fk" FOREIGN KEY ("local_order_id") REFERENCES "public"."kalshi_order"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_fill" ADD CONSTRAINT "kalshi_fill_market_ticker_kalshi_market_ticker_fk" FOREIGN KEY ("market_ticker") REFERENCES "public"."kalshi_market"("ticker") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_order" ADD CONSTRAINT "kalshi_order_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_order" ADD CONSTRAINT "kalshi_order_market_ticker_kalshi_market_ticker_fk" FOREIGN KEY ("market_ticker") REFERENCES "public"."kalshi_market"("ticker") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_order" ADD CONSTRAINT "kalshi_order_signal_id_kalshi_signal_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."kalshi_signal"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_position" ADD CONSTRAINT "kalshi_position_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_position" ADD CONSTRAINT "kalshi_position_market_ticker_kalshi_market_ticker_fk" FOREIGN KEY ("market_ticker") REFERENCES "public"."kalshi_market"("ticker") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_signal" ADD CONSTRAINT "kalshi_signal_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "kalshi_signal" ADD CONSTRAINT "kalshi_signal_market_ticker_kalshi_market_ticker_fk" FOREIGN KEY ("market_ticker") REFERENCES "public"."kalshi_market"("ticker") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kalshi_account_subaccount_number_idx" ON "kalshi_account" USING btree ("subaccount_number") WHERE "kalshi_account"."subaccount_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_fill_trading_account_id_idx" ON "kalshi_fill" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_fill_market_ticker_idx" ON "kalshi_fill" USING btree ("market_ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_fill_kalshi_order_id_idx" ON "kalshi_fill" USING btree ("kalshi_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_fill_executed_at_idx" ON "kalshi_fill" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_market_series_ticker_idx" ON "kalshi_market" USING btree ("series_ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_market_close_time_idx" ON "kalshi_market" USING btree ("close_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_market_status_idx" ON "kalshi_market" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_order_account_created_idx" ON "kalshi_order" USING btree ("trading_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_order_account_status_idx" ON "kalshi_order" USING btree ("trading_account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_order_market_ticker_idx" ON "kalshi_order" USING btree ("market_ticker");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kalshi_position_account_market_idx" ON "kalshi_position" USING btree ("trading_account_id","market_ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_signal_account_created_idx" ON "kalshi_signal" USING btree ("trading_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kalshi_signal_decision_idx" ON "kalshi_signal" USING btree ("decision");