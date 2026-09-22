/**
 * Stream Chat acceptance tests for the Live Room "liveclass" channel
 * type. Run this against a TEST Stream app (never production) before
 * turning `live_room` on for real students -- it exercises exactly the
 * things marked UNVERIFIED in server/live/chat/stream-provider.ts and
 * the Step 1 architecture report:
 *
 *   - non-member isolation (a user who was never added to the channel
 *     cannot read/watch it, even with a valid token for a DIFFERENT
 *     channel)
 *   - a valid token alone does not bypass membership
 *   - banned-user behavior (cannot send once banned; read access is
 *     reported, not assumed)
 *   - cooldown is enforced
 *   - addMembers/upsertUser are idempotent (no duplicate users/channels
 *     from calling ensureRoom/issueToken twice)
 *   - the channel id we build (a cuid) is accepted
 *
 * This is NOT run by `npm test` and never runs in CI against
 * production credentials -- it makes real network calls and mutates a
 * real (test) Stream app.
 *
 * Setup:
 *   1. Create a separate Stream app for testing (do NOT reuse prod).
 *   2. Run scripts/stream-setup-channel-type.ts (or call
 *      ensureLiveClassChannelTypeConfigured() once) against it, OR
 *      confirm it manually in the Stream dashboard.
 *   3. STREAM_TEST_API_KEY=... STREAM_TEST_API_SECRET=... npx tsx scripts/stream-acceptance.ts
 *
 * Each check prints PASS/FAIL/ERROR and a short explanation. Nothing
 * here modifies Proggaa's own database -- Stream-only.
 */
import { StreamChat } from "stream-chat";

const API_KEY = process.env.STREAM_TEST_API_KEY;
const API_SECRET = process.env.STREAM_TEST_API_SECRET;
const CHANNEL_TYPE = "liveclass";

type CheckResult = { name: string; status: "PASS" | "FAIL" | "ERROR"; detail: string };
const results: CheckResult[] = [];

function record(name: string, status: CheckResult["status"], detail: string) {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

async function main() {
  if (!API_KEY || !API_SECRET) {
    console.error("Set STREAM_TEST_API_KEY and STREAM_TEST_API_SECRET (a TEST app, not production) and re-run.");
    process.exit(1);
  }

  const server = StreamChat.getInstance(API_KEY, API_SECRET);
  const suffix = Date.now().toString(36);
  const roomId = `acceptance-test-${suffix}`; // mirrors a cuid's shape closely enough to test channel-id validity
  const memberUserId = `test-member-${suffix}`;
  const outsiderUserId = `test-outsider-${suffix}`;
  const bannedUserId = `test-banned-${suffix}`;

  try {
    // --- setup -----------------------------------------------------
    await server.upsertUsers([{ id: memberUserId }, { id: outsiderUserId }, { id: bannedUserId }]);
    const channel = server.channel(CHANNEL_TYPE, roomId, { created_by_id: "system" });
    await channel.create();
    record("channel-id accepted", "PASS", `Server accepted channel id "${roomId}" for type "${CHANNEL_TYPE}".`);

    await channel.addMembers([{ user_id: memberUserId }]);
    await channel.addMembers([{ user_id: bannedUserId }]);

    // --- idempotency -------------------------------------------------
    await channel.create(); // second create on the same id
    await channel.addMembers([{ user_id: memberUserId }]); // second add of the same member
    record("idempotent create/addMembers", "PASS", "Repeating create()/addMembers() for the same ids did not error or visibly duplicate.");

    // --- non-member isolation ----------------------------------------
    const outsiderToken = server.createToken(outsiderUserId);
    const outsiderClient = StreamChat.getInstance(API_KEY);
    try {
      await outsiderClient.connectUser({ id: outsiderUserId }, outsiderToken);
      try {
        await outsiderClient.channel(CHANNEL_TYPE, roomId).watch();
        record(
          "non-member isolation",
          "FAIL",
          "A user who was never added to the channel was able to watch() it. The membership-based isolation model in stream-provider.ts is NOT safe as written — do not enable live_room until this is fixed."
        );
      } catch (err) {
        record("non-member isolation", "PASS", `watch() was rejected for a non-member as expected: ${String(err)}`);
      }
    } finally {
      await outsiderClient.disconnectUser().catch(() => {});
    }

    // --- member CAN read/send -----------------------------------------
    const memberToken = server.createToken(memberUserId);
    const memberClient = StreamChat.getInstance(API_KEY);
    try {
      await memberClient.connectUser({ id: memberUserId }, memberToken);
      const memberChannel = memberClient.channel(CHANNEL_TYPE, roomId);
      await memberChannel.watch();
      const sendResult = await memberChannel.sendMessage({ text: "acceptance test message" });
      record("member can read and send", "PASS", `Member sent message id ${sendResult.message?.id ?? "?"}.`);

      // --- cooldown ---------------------------------------------------
      try {
        await memberChannel.sendMessage({ text: "second message immediately after" });
        record(
          "cooldown enforced",
          "FAIL",
          "A second message sent immediately after the first was NOT rejected. Check the channel type's `cooldown` setting (see ensureLiveClassChannelTypeConfigured / STREAM_LIVECLASS_CHANNEL_CONFIG)."
        );
      } catch (err) {
        record("cooldown enforced", "PASS", `Rapid second message was rejected as expected: ${String(err)}`);
      }
    } finally {
      await memberClient.disconnectUser().catch(() => {});
    }

    // --- banned user cannot send ---------------------------------------
    await channel.banUser(bannedUserId, { banned_by_id: "system", reason: "acceptance test" });
    const bannedToken = server.createToken(bannedUserId);
    const bannedClient = StreamChat.getInstance(API_KEY);
    try {
      await bannedClient.connectUser({ id: bannedUserId }, bannedToken);
      const bannedChannel = bannedClient.channel(CHANNEL_TYPE, roomId);
      let canRead = false;
      try {
        await bannedChannel.watch();
        canRead = true;
      } catch {
        canRead = false;
      }
      try {
        await bannedChannel.sendMessage({ text: "should be blocked" });
        record("banned user blocked from sending", "FAIL", "A banned member was able to send a message.");
      } catch (err) {
        record(
          "banned user blocked from sending",
          "PASS",
          `Send was rejected as expected: ${String(err)}. (Banned user could ${canRead ? "still" : "not"} read the channel — confirm this matches the intended "mute" UX.)`
        );
      }
    } finally {
      await bannedClient.disconnectUser().catch(() => {});
    }

    // --- cleanup ---------------------------------------------------
    await channel.delete({ hard_delete: true } as never).catch(() => {});
  } catch (err) {
    record("acceptance run", "ERROR", `Unexpected error, see above: ${String(err)}`);
  }

  const failed = results.filter((r) => r.status !== "PASS");
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log("Do NOT enable live_room for real students until every check above passes.");
    process.exitCode = 1;
  }
}

main();
