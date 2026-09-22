/**
 * DEV-ONLY bootstrap for exercising the Android app end-to-end before the admin UI exists.
 *
 *   npx tsx scripts/dev-payment-setup.ts --dev-database --device "Test phone"
 *   npx tsx scripts/dev-payment-setup.ts --dev-database --synthetic-rules
 *   npx tsx scripts/dev-payment-setup.ts --dev-database --receiving BKASH=01500000000
 *
 * --synthetic-rules publishes the INVENTED sender IDs/wording from
 * apps/payment-android/tools/synthetic-rules (NOT real provider formats). Never run it against production:
 * it would make your server accept messages from made-up senders. The script refuses to run without
 * --dev-database and when NODE_ENV/VERCEL_ENV is "production". Real provider rules are authored by an admin
 * from real messages and published through the admin UI/action instead.
 */
import { randomBytes } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { generateRegistrationCode, normalizeRegistrationCode, REGISTRATION_CODE_TTL_MS, sha256Hex } from "../src/lib/payments/sms/device-auth";
import { hashRules, providerRulesSchema } from "../src/lib/payments/sms/rules";
import { MFS_PROVIDERS } from "../src/lib/payments/sms/types";
import { normalizeMsisdn } from "../src/lib/payments/sms/amount";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (!has("--dev-database")) throw new Error("Refusing to run: pass --dev-database to confirm this is NOT your production database.");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("Refusing to run in a production environment.");
  const db = new PrismaClient();
  try {
    const deviceName = val("--device");
    if (deviceName) {
      const code = generateRegistrationCode();
      const expires = new Date(Date.now() + REGISTRATION_CODE_TTL_MS);
      // tokenHash is a placeholder nobody knows until the code is redeemed (same as the admin action).
      const d = await db.paymentBridgeDevice.create({
        data: {
          name: deviceName,
          tokenHash: sha256Hex(randomBytes(32).toString("hex")),
          registrationCodeHash: sha256Hex(normalizeRegistrationCode(code)),
          registrationCodeExpiresAt: expires,
        },
      });
      console.log(`Device "${d.name}" created (${d.id}).\nRegistration code (shown once, valid 15 min): ${code}`);
    }

    if (has("--synthetic-rules")) {
      const dir = join(__dirname, "..", "apps", "payment-android", "tools", "synthetic-rules");
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".synthetic.json"))) {
        const provider = f.split(".")[0]!.toUpperCase();
        if (!(MFS_PROVIDERS as readonly string[]).includes(provider)) continue;
        const rules = providerRulesSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
        const last = await db.providerConfiguration.findFirst({ where: { provider: provider as never }, orderBy: { version: "desc" }, select: { version: true } });
        const version = (last?.version ?? 0) + 1;
        await db.providerConfiguration.create({
          data: { provider: provider as never, version, enabled: true, rules: rules as never, rulesHash: hashRules(rules) },
        });
        console.log(`Published SYNTHETIC ${provider} rules as version ${version} (enabled).`);
      }
    }

    const receiving = val("--receiving");
    if (receiving) {
      const [provider, number] = receiving.split("=");
      const n = normalizeMsisdn(number);
      if (!provider || !n || !(MFS_PROVIDERS as readonly string[]).includes(provider)) throw new Error("Use --receiving PROVIDER=01XXXXXXXXX");
      await db.paymentConfiguration.upsert({
        where: { provider: provider as never },
        create: { provider: provider as never, receivingNumber: n, displayName: provider },
        update: { receivingNumber: n, configurationVersion: { increment: 1 } },
      });
      console.log(`Receiving number for ${provider} set to ${n}.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
