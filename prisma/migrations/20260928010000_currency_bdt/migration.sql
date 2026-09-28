-- Proggaa sells only in Bangladeshi taka. Course.currency defaulted to
-- 'USD' (Payment.currency was already 'BDT'); switch the default and
-- relabel existing rows. Amounts are unchanged — *Cents columns already
-- hold poisha (1/100 taka).
ALTER TABLE "Course" ALTER COLUMN "currency" SET DEFAULT 'BDT';
UPDATE "Course" SET "currency" = 'BDT' WHERE "currency" = 'USD';
UPDATE "Payment" SET "currency" = 'BDT' WHERE "currency" = 'USD';
