// Telegram is ONLY an admin-notification channel here — never a
// verification path. Every function in this file is fire-and-forget:
// if the bot token/chat ID aren't configured, or the Telegram API call
// fails, we log and move on. A payment must never succeed or fail based
// on whether a Telegram message went through.

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return; // not configured — nothing to do, and that's fine

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error("Telegram admin alert failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("Telegram admin alert failed:", err);
  }
}

export async function sendPaymentVerifiedAlert(input: {
  studentName: string;
  missionTitle: string;
  amountLabel: string;
  reference: string;
  txid: string | null;
  automatic: boolean;
}) {
  const text = [
    "💰 <b>Payment Verified</b>",
    "",
    `Student: ${escapeHtml(input.studentName)}`,
    `Mission: ${escapeHtml(input.missionTitle)}`,
    `Amount: ${escapeHtml(input.amountLabel)}`,
    `Reference: ${escapeHtml(input.reference)}`,
    `TXID: ${escapeHtml(input.txid ?? "—")}`,
    "",
    input.automatic ? "✅ Automatically verified" : "✅ Verified by admin",
  ].join("\n");
  await sendTelegramMessage(text);
}

export async function sendPaymentReviewAlert(input: {
  reference: string;
  amountLabel: string;
  txid: string | null;
  reason?: string;
}) {
  const text = [
    "⚠️ <b>Payment Requires Review</b>",
    "",
    `Reference: ${escapeHtml(input.reference)}`,
    `Amount: ${escapeHtml(input.amountLabel)}`,
    `TXID: ${escapeHtml(input.txid ?? "—")}`,
    ...(input.reason ? [`Note: ${escapeHtml(input.reason)}`] : []),
  ].join("\n");
  await sendTelegramMessage(text);
}

export async function sendPaymentRejectedAlert(input: { reference: string; reason: string }) {
  const text = [
    "❌ <b>Payment Rejected</b>",
    "",
    `Reference: ${escapeHtml(input.reference)}`,
    `Reason: ${escapeHtml(input.reason)}`,
  ].join("\n");
  await sendTelegramMessage(text);
}
