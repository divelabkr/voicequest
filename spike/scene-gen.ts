// 콘텐츠 공장 무료 프로토타입 — guide 기반 씬 골격 초안 생성(로컬 Qwen, 키 0).
// 작가는 텍스트 안 짜고 guide만; LLM이 골격 초안 → 사람/Claude 검수 → 통일.
// 실행: pnpm --filter @voicequest/spike exec tsx scene-gen.ts
import ep3 from "../content/episodes/ep_03_sora_school.json";

const NEED = 10 - ep3.scenes.length; // 5씬 → +5

const existing = ep3.scenes.map((s, i) => `${i + 1}. ${s.intent} (${s.level})`).join("\n");

const prompt = `일본 고등학교 학원물 회화 학습 에피소드의 씬 골격을 설계한다.
캐릭터: ${ep3.guide.persona}
톤: ${ep3.guide.tone}
금지: ${ep3.guide.guardrails.join(" / ")}

기존 ${ep3.scenes.length}개 씬:
${existing}

이 에피소드를 10씬으로 늘린다. 자연스럽게 이어지는 추가 씬 ${NEED}개의 골격을 생성하라.
각 씬 객체 필드:
- intent: 한국어 한 줄(이 씬에서 유저가 해야 할 말의 의도)
- situation: 한국어 한 줄(상황)
- level: "N5" | "N4" | "N3" | "OPIc" 중 하나(난이도 점증)
- allowedExpressions: 반말(だ체) 일본어 표현 3개 배열
- modelAnswer: 반말 일본어 모범답안 1개
반말로, 무례하지 않게, 또래 친구 톤. 반드시 {"scenes":[...]} JSON만 출력.`;

async function main(): Promise<void> {
  console.log(`🏭 학원물 추가 씬 ${NEED}개 — Qwen 무료 생성\n`);
  const res = await fetch("http://localhost:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.6,
    }),
  });
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0]?.message?.content ?? "{}";
  let parsed: { scenes?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log("⚠️ JSON 파싱 실패, 원문:\n", raw.slice(0, 800));
    return;
  }
  const scenes = parsed.scenes ?? [];
  console.log(`생성 ${scenes.length}개:\n`);
  for (const s of scenes as Array<Record<string, unknown>>) {
    console.log(`▸ [${s.level}] ${s.intent}`);
    console.log(`   상황: ${s.situation}`);
    console.log(`   허용: ${(s.allowedExpressions as string[] | undefined)?.join(" / ")}`);
    console.log(`   모범: ${s.modelAnswer}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
