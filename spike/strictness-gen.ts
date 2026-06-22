// "엄격↔자유" 슬라이더 데모 — 같은 맥락에서 strictness 3단계로 씬 골격 생성.
// intent(골격)는 고정, allowedExpressions·beats(표면)만 변주. 판정은 항상 골격 양자화(§0-4).
// 실행: tsx strictness-gen.ts
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || !m[1]) continue;
  const v = (m[2] ?? "").replace(/\s+#.*$/, "").trim().replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\r$/, "");
  if (v) env[m[1]] = v;
}
const KEY = env.ANTHROPIC_KEY ?? env.ANTHROPIC_API_KEY ?? "";

const CONTEXT = "라멘집에서 다이키에게 매운맛 추가를 부탁하기 (다이키와 친해진 뒤)";

async function gen(strictness: "strict" | "normal" | "free"): Promise<string> {
  const rules = {
    strict: "허용표현 1~2개(정답만), beats 짧고 정형(2개). 시험 모드.",
    normal: "허용표현 3~5개, beats 적당히 변주(3개).",
    free: "허용표현 6개+(구어·반말·동의어 포함), beats 풍부·감정적(4개). 단 자유대화 아님 — intent는 동일.",
  }[strictness];
  const prompt = `너는 일본어 학습 게임 콘텐츠 디자이너다. 아래 맥락으로 씬 골격 1개를 JSON으로만 출력해라.
맥락: "${CONTEXT}"
난이도(strictness): ${strictness} — ${rules}
규칙: intent(의도)는 strictness와 무관하게 항상 동일해야 한다(골격 고정). allowedExpressions·beats(표면)만 변주.
JSON 형식: {"intent":"한국어 의도","allowedExpressions":["일본어..."],"beats":[{"kind":"npc","line":"일본어..."},{"kind":"user"}]}
JSON만, 설명 없이.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`anthropic_${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = (await r.json()) as { content?: Array<{ text?: string }> };
  return j.content?.[0]?.text ?? "(빈 응답)";
}

async function main(): Promise<void> {
  console.log(`🎚️  맥락: "${CONTEXT}"\n`);
  for (const s of ["strict", "normal", "free"] as const) {
    const label = { strict: "◀ 엄격(시험)", normal: "● 중간(표준)", free: "자유(몰입) ▶" }[s];
    console.log(`━━━━━━ ${label} ━━━━━━`);
    try {
      console.log(((await gen(s)) ?? "").trim() + "\n");
    } catch (e) { console.log("실패: " + String(e).slice(0, 130) + "\n"); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
