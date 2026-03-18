CREATE TYPE "public"."account_type" AS ENUM('investment', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('us_equity', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');--> statement-breakpoint
CREATE TYPE "public"."time_in_force" AS ENUM('day', 'gtc');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_bar" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"date" date NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	"trade_count" integer,
	"vwap" double precision
);
--> statement-breakpoint
CREATE TABLE "holding" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_account_id" integer NOT NULL,
	"ticker" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"quantity" numeric(16, 8) DEFAULT '0' NOT NULL,
	"average_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" serial PRIMARY KEY NOT NULL,
	"trading_account_id" integer NOT NULL,
	"ticker" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"side" "order_side" NOT NULL,
	"order_type" "order_type" NOT NULL,
	"time_in_force" time_in_force NOT NULL,
	"quantity" numeric(16, 8) NOT NULL,
	"limit_price" numeric(14, 2),
	"stop_price" numeric(14, 2),
	"filled_quantity" numeric(16, 8) DEFAULT '0' NOT NULL,
	"average_fill_price" numeric(14, 2),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"ticker" text PRIMARY KEY NOT NULL,
	"price" double precision,
	"bid_price" double precision,
	"bid_size" double precision,
	"ask_price" double precision,
	"ask_size" double precision,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"close" double precision,
	"volume" double precision,
	"trade_count" integer,
	"vwap" double precision,
	"previous_close" double precision,
	"change" double precision,
	"change_percent" double precision,
	"source" text,
	"timestamp" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "symbol" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"exchange" text,
	"asset_class" "asset_class" NOT NULL,
	"tradable" boolean DEFAULT true NOT NULL,
	"fractionable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_account" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"balance" numeric(14, 2) DEFAULT '100000' NOT NULL,
	"is_joint" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"trading_account_id" integer NOT NULL,
	"ticker" text NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" numeric(16, 8) NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ticker" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_member" ADD CONSTRAINT "account_member_account_id_trading_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_member" ADD CONSTRAINT "account_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_bar" ADD CONSTRAINT "daily_bar_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding" ADD CONSTRAINT "holding_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding" ADD CONSTRAINT "holding_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_trading_account_id_trading_account_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "account_member_accountId_idx" ON "account_member" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_member_userId_idx" ON "account_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_bar_ticker_date_idx" ON "daily_bar" USING btree ("ticker","date");--> statement-breakpoint
CREATE INDEX "daily_bar_ticker_idx" ON "daily_bar" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "daily_bar_date_idx" ON "daily_bar" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "holding_account_ticker_idx" ON "holding" USING btree ("trading_account_id","ticker");--> statement-breakpoint
CREATE INDEX "holding_trading_account_id_idx" ON "holding" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX "holding_ticker_idx" ON "holding" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "order_trading_account_id_idx" ON "order" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX "order_ticker_idx" ON "order" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_created_at_idx" ON "order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "symbol_asset_class_idx" ON "symbol" USING btree ("asset_class");--> statement-breakpoint
CREATE INDEX "symbol_name_idx" ON "symbol" USING btree ("name");--> statement-breakpoint
CREATE INDEX "trading_account_type_idx" ON "trading_account" USING btree ("type");--> statement-breakpoint
CREATE INDEX "transaction_trading_account_id_idx" ON "transaction" USING btree ("trading_account_id");--> statement-breakpoint
CREATE INDEX "transaction_order_id_idx" ON "transaction" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "transaction_ticker_idx" ON "transaction" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "transaction_created_at_idx" ON "transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_item_user_ticker_idx" ON "watchlist_item" USING btree ("user_id","ticker");--> statement-breakpoint
CREATE INDEX "watchlist_item_user_id_idx" ON "watchlist_item" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watchlist_item_ticker_idx" ON "watchlist_item" USING btree ("ticker");