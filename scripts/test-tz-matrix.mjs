// Runs the timezone-sensitive Live Class specs under several process
// timezones, proving nothing depends on the runtime/device zone.
// Usage: npm run test:tz
import { spawnSync } from "node:child_process";

const ZONES = [
  "UTC",
  "Asia/Dhaka",
  "America/Los_Angeles", // behind UTC, has DST
  "Pacific/Kiritimati", // UTC+14 — the furthest ahead
  "Asia/Kolkata", // UTC+5:30 — a half-hour offset next to Dhaka
  "Europe/London", // "BST" also means British Summer Time here
];
const SPECS = [
  "src/lib/timezone.test.ts",
  "src/lib/timezone.live.test.ts",
  "src/lib/live-classes.test.ts",
  "src/lib/live",
];

const isWindows = process.platform === "win32";
let failed = 0;
for (const zone of ZONES) {
  console.log(`\n=== TZ=${zone} ===`);
  const result = spawnSync(isWindows ? "npx.cmd" : "npx", ["vitest", "run", ...SPECS], {
    stdio: "inherit",
    env: { ...process.env, TZ: zone },
    shell: isWindows,
  });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} timezone run(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${ZONES.length} timezone runs passed.`);
