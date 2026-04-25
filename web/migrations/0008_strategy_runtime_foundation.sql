DO $$ BEGIN CREATE TYPE "public"."strategy_type" AS ENUM('ema_crossover'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_status" AS ENUM('active', 'paused', 'disabled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_signal" AS ENUM('buy', 'sell', 'hold'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."strategy_action" AS ENUM('place_buy', 'place_sell', 'none'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "strategy" (
  "id" serial PRIMARY KEY NOT NULL,
  "trading_account_id" integer NOT NULL,
  "name" text NOT NULL,
  "strategy_type" "strategy_type" DEFAULT 'ema_crossover' NOT NULL,
  "ticker" text NOT NULL,
  "symbols_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timeframe" text DEFAULT '1Day' NOT NULL,
  "capital_allocation" numeric(14, 2) DEFAULT '10000' NOT NULL,
  "params_json" jsonb NOT NULL,
  "risk_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" "strategy_status" DEFAULT 'active' NOT NULL,
  "last_run_at" timestamp with time zone,
  "last_signal_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "strategy_run" (
  "id" serial PRIMARY KEY NOT NULL,
  "strategy_id" integer NOT NULL,
  "trading_account_id" integer NOT NULL,
  "ticker" text NOT NULL,
  "run_at" timestamp with time zone DEFAULT now() NOT NULL,
  "signal" "strategy_signal" DEFAULT 'hold' NOT NULL,
  "action" "strategy_action" DEFAULT 'none' NOT NULL,
  "reason" text NOT NULL,
  "inputs_json" jsonb NOT NULL,
  "order_id" integer,
  "error" text
);--> statement-breakpoint

ALTER TABLE "strategy" ADD COLUMN IF NOT EXISTS "symbols_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "strategy" ADD COLUMN IF NOT EXISTS "capital_allocation" numeric(14, 2) DEFAULT '10000' NOT NULL;--> statement-breakpoint
ALTER TABLE "strategy" ADD COLUMN IF NOT EXISTS "risk_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "strategy"
    ADD CONSTRAINT "strategy_trading_account_id_trading_account_id_fk"
    FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "strategy"
    ADD CONSTRAINT "strategy_ticker_symbol_ticker_fk"
    FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "strategy_run"
    ADD CONSTRAINT "strategy_run_strategy_id_strategy_id_fk"
    FOREIGN KEY ("strategy_id") REFERENCES "public"."strategy"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "strategy_run"
    ADD CONSTRAINT "strategy_run_trading_account_id_trading_account_id_fk"
    FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "strategy_run"
    ADD CONSTRAINT "strategy_run_ticker_symbol_ticker_fk"
    FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "strategy_run"
    ADD CONSTRAINT "strategy_run_order_id_order_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "strategy_trading_account_id_idx" ON "strategy" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_ticker_idx" ON "strategy" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_status_idx" ON "strategy" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_account_type_ticker_idx" ON "strategy" USING btree ("trading_account_id", "strategy_type", "ticker");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_run_strategy_id_idx" ON "strategy_run" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_run_trading_account_id_idx" ON "strategy_run" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "strategy_run_run_at_idx" ON "strategy_run" USING btree ("run_at");
