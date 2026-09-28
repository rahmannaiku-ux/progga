-- A 100%-off coupon brings the charge to 0, so checkout marks the payment PAID
-- immediately instead of waiting for a bKash TXID / admin verification.
ALTER TYPE "VerificationMethod" ADD VALUE 'FULL_DISCOUNT_COUPON';
