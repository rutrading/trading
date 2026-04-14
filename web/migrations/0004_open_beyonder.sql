CREATE TABLE "company" (
	"ticker" text PRIMARY KEY NOT NULL,
	"description" text,
	"sector" text,
	"industry" text,
	"logo_url" text
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_ticker_symbol_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."symbol"("ticker") ON DELETE cascade ON UPDATE no action;