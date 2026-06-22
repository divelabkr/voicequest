// 데일리 풀 표현 → 히라가나 후리가나(한자→가나). 한글 발음 변환용. kuroshiro 빌드타임.
// 실행: tsx daily-yomi.ts → content/daily-yomi.json
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);

const Kuroshiro = require("kuroshiro").default ?? require("kuroshiro");
const KuromojiAnalyzer = require("kuroshiro-analyzer-kuromoji").default ?? require("kuroshiro-analyzer-kuromoji");

async function main(): Promise<void> {
  const k = new Kuroshiro();
  await k.init(new KuromojiAnalyzer());
  const epDir = fileURLToPath(new URL("../content/episodes/", import.meta.url));
  const exprs = new Set<string>();
  for (const f of readdirSync(epDir).filter((n) => n.endsWith(".json"))) {
    const e = JSON.parse(readFileSync(`${epDir}${f}`, "utf8")) as { scenes: Array<{ allowedExpressions?: string[] }> };
    for (const s of e.scenes) for (const ex of s.allowedExpressions ?? []) exprs.add(ex);
  }
  const yomi: Record<string, string> = {};
  for (const ex of exprs) yomi[ex] = await k.convert(ex, { to: "hiragana" });
  writeFileSync(fileURLToPath(new URL("../content/daily-yomi.json", import.meta.url)), JSON.stringify(yomi, null, 2));
  console.log(`✅ ${Object.keys(yomi).length}개 표현 후리가나 → content/daily-yomi.json`);
}
main().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
