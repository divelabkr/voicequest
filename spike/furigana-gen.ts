// 후리가나 빌드타임 생성 — NPC 대사 한자에 읽기 부착(kuroshiro + kuromoji).
// kuroshiro는 CJS라 createRequire로 로드. okurigana 모드=한자(읽기) 텍스트(RN 친화).
// "NPC는 캐시" 원칙대로 빌드타임 생성→콘텐츠 저장. 실행: tsx furigana-gen.ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const KuroshiroPkg = require("kuroshiro");
const Kuroshiro = KuroshiroPkg.default ?? KuroshiroPkg;
const AnalyzerPkg = require("kuroshiro-analyzer-kuromoji");
const KuromojiAnalyzer = AnalyzerPkg.default ?? AnalyzerPkg;

const NPC_LINES = [
  "いらっしゃいませ!",
  "あ、今ちょっと混んでてね…まあまあ、立ち話もなんだし、座って座って",
  "一人ですか?二人ですか?",
  "学校はどうだった?",
];

async function main(): Promise<void> {
  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(new KuromojiAnalyzer());
  console.log("📝 NPC 대사 후리가나 (kuroshiro + kuromoji)\n");
  for (const line of NPC_LINES) {
    const okuri = await kuroshiro.convert(line, { mode: "okurigana", to: "hiragana" });
    const ruby = await kuroshiro.convert(line, { mode: "furigana", to: "hiragana" });
    console.log(`원문 : ${line}`);
    console.log(`읽기 : ${okuri}`);
    console.log(`ruby : ${ruby.slice(0, 80)}${ruby.length > 80 ? "…" : ""}\n`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
