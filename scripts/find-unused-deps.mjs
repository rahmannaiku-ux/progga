// Lists dependencies in package.json that no file under src/, prisma/ or the
// root config files imports, and prints the uninstall command.
//   node scripts/find-unused-deps.mjs
// Run it once ALL route folders are present (folders named [like-this] were
// missing from an earlier zip and may import some of these).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|css|prisma)$/.test(name)) files.push(p);
  }
})(root);
const source = files.map((f) => readFileSync(f, "utf8")).join("\n");

// Packages that are used without being imported from source.
const TOOLING = new Set(["typescript", "prisma", "tailwindcss", "postcss", "autoprefixer", "eslint", "eslint-config-next", "vitest", "tsx", "tailwindcss-animate", "prettier"]);
const unused = Object.keys(pkg.dependencies ?? {}).filter((name) => {
  if (TOOLING.has(name) || name.startsWith("@types/")) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return !new RegExp(`['"\`]${esc}(/[^'"\`]*)?['"\`]`).test(source);
});
if (!unused.length) console.log("No unused dependencies found.");
else {
  console.log("Not imported anywhere:\n  " + unused.join("\n  "));
  console.log(`\nRemove with:\n  npm uninstall ${unused.join(" ")}`);
}
