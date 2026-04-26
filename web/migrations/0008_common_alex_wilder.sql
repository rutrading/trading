CREATE TABLE IF NOT EXISTS "article_stock_ticker" (
	"ticker_id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "author" (
	"author_id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"author_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_article" (
	"article_id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"summary" text,
	"thumbnail" text,
	"date_published" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_article_ticker_bridge" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"ticker_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_source" (
	"news_source_id" serial PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	CONSTRAINT "news_source_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_article_source_bridge" (
	"id" serial PRIMARY KEY NOT NULL,
	"news_source_id" integer NOT NULL,
	"article_id" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "author" ADD CONSTRAINT "author_article_id_news_article_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_article"("article_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "news_article_ticker_bridge" ADD CONSTRAINT "news_article_ticker_bridge_article_id_news_article_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_article"("article_id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "news_article_ticker_bridge" ADD CONSTRAINT "news_article_ticker_bridge_ticker_id_article_stock_ticker_ticker_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."article_stock_ticker"("ticker_id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "news_article_source_bridge" ADD CONSTRAINT "news_article_source_bridge_news_source_id_news_source_news_source_id_fk" FOREIGN KEY ("news_source_id") REFERENCES "public"."news_source"("news_source_id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "news_article_source_bridge" ADD CONSTRAINT "news_article_source_bridge_article_id_news_article_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_article"("article_id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE VIEW "public"."article_summary_view" AS (
  SELECT 
    "news_article"."article_id" as article_id, 
    "news_article"."title" as title,
    "news_article"."url" as url,
    "news_article"."summary" as summary,
    "news_article"."thumbnail" as thumbnail,
    "news_article"."date_published" as date_published,
    "news_source"."source_name" as source_name,
    (SELECT STRING_AGG("author"."author_name", ', ') 
        FROM "author" 
        WHERE "news_article"."article_id" = "author"."article_id"
    ) AS authors,
    (
        SELECT STRING_AGG("article_stock_ticker"."ticker", ', ') 
        FROM "article_stock_ticker" 
		    join "news_article_ticker_bridge" on ("news_article"."article_id" = "news_article_ticker_bridge"."article_id")
        WHERE "news_article_ticker_bridge"."ticker_id" = "article_stock_ticker"."ticker_id"
    ) AS tickers
  FROM "news_article"
  LEFT JOIN "news_article_source_bridge" ON "news_article"."article_id" = "news_article_source_bridge"."article_id"
  LEFT JOIN "news_source" ON "news_article_source_bridge"."news_source_id" = "news_source"."news_source_id"
  ORDER BY "news_article"."date_published" DESC
);