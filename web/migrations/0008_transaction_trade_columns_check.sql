-- Enforce that trade-kind transactions retain referential integrity for the
-- columns that became nullable when deposit/withdrawal kinds were added in
-- 0005_fat_nemesis.sql. A bug elsewhere can otherwise insert a malformed
-- "trade" row that breaks the running-cash walk in getAllTransactions.
DO $$ BEGIN
  ALTER TABLE "transaction"
    ADD CONSTRAINT "transaction_trade_columns_required_check"
    CHECK (
      kind <> 'trade'
      OR (
        order_id IS NOT NULL
        AND ticker IS NOT NULL
        AND side IS NOT NULL
        AND quantity IS NOT NULL
        AND price IS NOT NULL
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
