/**
 * One-time (safe to re-run) setup of the "liveclass" Stream channel
 * type: text-only, membership-gated, capped message length, cooldown,
 * no reactions/replies/typing/read events -- the config the whole
 * Live Room security/UX model assumes (see
 * server/live/chat/stream-provider.ts's STREAM_LIVECLASS_CHANNEL_CONFIG
 * and its header comment).
 *
 * Run this ONCE per Stream app (once for your test app, once for your
 * real app) before running scripts/stream-acceptance.ts or turning
 * live_room on. Re-running it is harmless -- it updates the existing
 * type in place rather than erroring.
 *
 * Usage:
 *   STREAM_API_KEY=... STREAM_API_SECRET=... npx tsx scripts/stream-setup-channel-type.ts
 *
 * For the test app, use the STREAM_TEST_* pair instead:
 *   STREAM_API_KEY=$STREAM_TEST_API_KEY STREAM_API_SECRET=$STREAM_TEST_API_SECRET npx tsx scripts/stream-setup-channel-type.ts
 */
import { ensureLiveClassChannelTypeConfigured, STREAM_LIVECLASS_CHANNEL_CONFIG } from "../src/server/live/chat/stream-provider";

async function main() {
  if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
    console.error("Set STREAM_API_KEY and STREAM_API_SECRET before running this.");
    process.exit(1);
  }

  console.log(`Configuring the "${STREAM_LIVECLASS_CHANNEL_CONFIG.type}" channel type...`);
  await ensureLiveClassChannelTypeConfigured();
  console.log("Done. Config applied:", STREAM_LIVECLASS_CHANNEL_CONFIG);
  console.log(
    "\nNOTE: this sets the channel-level settings (message length, cooldown, disabled features).\n" +
    "It does NOT set permission grants (who can read/send/pin/etc) -- confirm those in the\n" +
    "Stream Dashboard under this channel type's Permissions tab, per the UNVERIFIED note in\n" +
    "stream-provider.ts (the exact grant names were not confirmed against a real app)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
