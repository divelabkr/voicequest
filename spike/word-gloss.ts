// 단어 뜻 — kuromoji로 NPC 대사를 단어 분해 + 사전 매핑. 단어 탭→뜻 학습 보조.
// GLOSS는 데모(핵심 단어). 실제는 JMdict-simplified JSON으로 교체(빌드타임 캐시).
// 실행: tsx word-gloss.ts
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");
const dicPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");

// 데모 사전 — 실제 JMdict 연동 지점(여기를 JMdict-simplified로 교체)
const GLOSS: Record<string, string> = {
  今: "지금, 현재",
  混む: "붐비다, 혼잡하다",
  立ち話: "선 채로 나누는 이야기",
  座る: "앉다",
  学校: "학교",
  一人: "한 명, 혼자",
  二人: "두 명",
  来る: "오다",
};

const LINE = "あ、今ちょっと混んでてね…まあまあ、立ち話もなんだし、座って座って";

kuromoji
  .builder({ dicPath })
  .build((err: unknown, tokenizer: { tokenize(s: string): Array<{ surface_form: string; basic_form: string; pos: string }> }) => {
    if (err) { console.error(String(err).slice(0, 200)); process.exit(1); }
    console.log("📖 단어 뜻 (kuromoji 분해 + 사전 — JMdict 연동 지점)\n");
    console.log(`문장: ${LINE}\n`);
    let hit = 0;
    for (const t of tokenizer.tokenize(LINE)) {
      const base = t.basic_form !== "*" ? t.basic_form : t.surface_form;
      const gloss = GLOSS[base];
      if (gloss) { console.log(`  ${t.surface_form} (${base}) [${t.pos}] — ${gloss}`); hit++; }
    }
    console.log(`\n  ${hit}개 단어에 뜻 부착(데모 사전). 실제는 JMdict-simplified 교체.`);
  });
