import type { ActiveProviderConfig } from "./parser";

/**
 * SYNTHETIC fixtures. The sender IDs and message wording below are invented
 * for tests and are NOT the real formats of any provider. Production
 * configurations must be authored by an admin from real messages they
 * received on their own phone — this repo ships none.
 *
 * The same cases are mirrored in the Android unit tests so both
 * implementations of the rule engine are pinned to identical behavior.
 */

export const NOW = Date.UTC(2026, 8, 21, 4, 30, 0); // 2026-09-21 10:30 in Asia/Dhaka

const base = { schemaVersion: 1 as const, maxTransactionAgeMinutes: 1440 };

export const CONFIGS: ActiveProviderConfig[] = [
  {
    provider: "BKASH",
    version: 3,
    rules: {
      ...base,
      providerKeywords: ["synbkash"],
      senderRules: [{ pattern: "TESTBK", senderType: "ALPHANUMERIC", enabled: true }],
      parserRules: [
        {
          name: "received-v1",
          messageStructure: "You have received Tk <amount> from <number>. TrxID <id> at <DD/MM/YYYY HH:mm>",
          requiredPhrases: ["you have received", "trxid"],
          forbiddenPhrases: ["otp", "pin"],
          transactionIdPattern: "TrxID\\s+([A-Z0-9]+)",
          transactionIdFormat: "[A-Z0-9]{8,12}",
          amountPattern: "received Tk\\s*([\\d,]+(?:\\.\\d{1,2})?)",
          senderNumberPattern: "from\\s+(\\+?[\\d-]{11,15})",
          timePattern: "at\\s+(\\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2})",
          timeFormat: "DD/MM/YYYY HH:mm",
          requireReceiver: false,
          enabled: true,
        },
      ],
    },
  },
  {
    provider: "NAGAD",
    version: 1,
    rules: {
      ...base,
      providerKeywords: ["synnagad"],
      senderRules: [{ pattern: "TESTNG", senderType: "ALPHANUMERIC", enabled: true }],
      parserRules: [
        {
          name: "money-received",
          requiredPhrases: ["money received", "txnid"],
          forbiddenPhrases: [],
          transactionIdPattern: "TxnID:\\s*([A-Z0-9]+)",
          transactionIdFormat: "[A-Z0-9]{8,10}",
          amountPattern: "Amount:\\s*Tk\\s*([\\d,]+(?:\\.\\d{1,2})?)",
          senderNumberPattern: "Sender:\\s*(\\d{11})",
          timePattern: "Time:\\s*(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})",
          timeFormat: "YYYY-MM-DD HH:mm:ss",
          requireReceiver: false,
          enabled: true,
        },
      ],
    },
  },
  {
    provider: "ROCKET",
    version: 2,
    rules: {
      ...base,
      providerKeywords: ["synrocket"],
      senderRules: [{ pattern: "16216", senderType: "SHORTCODE", enabled: true }],
      parserRules: [
        {
          name: "received-with-ref",
          requiredPhrases: ["received", "txnid"],
          forbiddenPhrases: [],
          transactionIdPattern: "TxnId:(\\d+)",
          transactionIdFormat: "\\d{10}",
          amountPattern: "Tk\\s*([\\d,]+(?:\\.\\d{1,2})?) received",
          senderNumberPattern: "from\\s+(\\d{11})",
          timePattern: "Date:(\\d{2}-\\d{2}-\\d{4} \\d{2}:\\d{2} [AP]M)",
          timeFormat: "DD-MM-YYYY hh:mm A",
          requireReceiver: false,
          enabled: true,
        },
      ],
    },
  },
  {
    provider: "UPAY",
    version: 1,
    rules: {
      ...base,
      providerKeywords: ["synupay"],
      senderRules: [{ pattern: "TESTUP", senderType: "ALPHANUMERIC", enabled: true }],
      parserRules: [
        {
          name: "received-to-number",
          requiredPhrases: ["received", "trxid"],
          forbiddenPhrases: [],
          transactionIdPattern: "TrxID\\s+([A-Z0-9]+)",
          transactionIdFormat: "UP[A-Z0-9]{8}",
          amountPattern: "Tk\\s*([\\d,]+(?:\\.\\d{1,2})?) received",
          senderNumberPattern: "from\\s+(\\d{11})",
          receiverNumberPattern: "to\\s+(\\d{11})",
          requireReceiver: true,
          enabled: true,
        },
      ],
    },
  },
];

export const RECEIVING = "01500000000";

export const MESSAGES = {
  bkashOk: { sender: "TESTBK", body: "You have received Tk 500.00 from 01712345678. TrxID SYN12345AB at 21/09/2026 10:15" },
  // NBSP (U+00A0) between "Tk" and the amount: JS \\s matches it, Java \\s does not -> both engines normalize first
  bkashNbsp: { sender: "TESTBK", body: "You have received Tk\u00A0500.00 from 01712345678. TrxID SYN12345BB at 21/09/2026 10:15" },
  bkashCommaAmount: { sender: "TESTBK", body: "You have received Tk 1,250.50 from 01712345678. TrxID SYN12345AC at 21/09/2026 10:16" },
  nagadOk: { sender: "TESTNG", body: "Money Received. Amount: Tk 750 Sender: 01812345678 TxnID: SYN9ZQ7K2M Time: 2026-09-21 10:15:30" },
  rocketOk: { sender: "16216", body: "Tk 500.00 received from 01912345678 TxnId:1234567890 Date:21-09-2026 10:15 AM" },
  upayOk: { sender: "TESTUP", body: "Tk 300.00 received from 01612345678 to 01500000000. TrxID UPAY12345A" },
  // known sender, but not a transaction (promo / balance / OTP)
  bkashPromo: { sender: "TESTBK", body: "Get 5% cashback this weekend on mobile recharge." },
  bkashOtp: { sender: "TESTBK", body: "Your OTP is 123456. You have received Tk 500 TrxID SYN12345AB" },
  // impersonation: right wording, wrong sender
  fakeBkashUnknownNumber: { sender: "+8801999999999", body: "You have received Tk 500.00 from 01712345678. TrxID FAKE123456 at 21/09/2026 10:15" },
  fakeBkashKeywordOnly: { sender: "01999999999", body: "synbkash payment received Tk 500 TrxID ABC123" },
  // modifications
  amountObfuscated: { sender: "TESTBK", body: "You have received Tk 5OO from 01712345678. TrxID SYN12345AB at 21/09/2026 10:15" },
  shortTrxId: { sender: "TESTBK", body: "You have received Tk 500.00 from 01712345678. TrxID AB1 at 21/09/2026 10:15" },
  missingTrxId: { sender: "TESTBK", body: "You have received Tk 500.00 from 01712345678 at 21/09/2026 10:15" },
  futureTime: { sender: "TESTBK", body: "You have received Tk 500.00 from 01712345678. TrxID SYN12345AB at 21/09/2026 18:15" },
  staleTime: { sender: "TESTBK", body: "You have received Tk 500.00 from 01712345678. TrxID SYN12345AB at 10/09/2026 10:15" },
  impossibleDate: { sender: "TESTBK", body: "You have received Tk 500.00 from 01712345678. TrxID SYN12345AB at 31/02/2026 10:15" },
  unrelated: { sender: "Mom", body: "Dinner at 8?" },
} as const;
