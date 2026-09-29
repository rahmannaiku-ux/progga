-- Signed-in students can change their login phone from /profile; the new
-- number is verified with an OTP of this purpose before User.phone changes.
ALTER TYPE "OtpPurpose" ADD VALUE 'PHONE_CHANGE';
