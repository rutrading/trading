ALTER TABLE "holding" ADD COLUMN IF NOT EXISTS "reserved_quantity" numeric(16, 8) DEFAULT '0' NOT NULL;
