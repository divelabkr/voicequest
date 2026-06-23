// 콘텐츠 공장: 씬 생성기(빌드타임·admin 전용). "생성은 LLM, 판정은 골격"(§4) — intent 강제 고정·sceneGuard 검수.
// judge용 로컬 Qwen과 분리. 공급자는 LlmGenPort 뒤(키 있으면 Anthropic 품질, 없으면 무료 Qwen).
import type { LlmGenPort, Scene, Strictness } from "@voicequest/engine";

const BAND_HINT: Record<Strictness, string> = {
  strict: "허용표현 1~2개(정답만), beats 짧고 정형(2개). 시험 모드.",
  normal: "허용표현 3~5개, beats 적당히 변주(3~5개).",
  lenient: "허용표현 6개+(구어·반말·동의어), beats 풍부·감정적(5~7개). 단 자유대화 아님.",
};

/** 공급자 조립 — 키 있으면 Anthropic 품질, 없으면 무료 로컬 Qwen(Ollama). 콘텐츠 공장도 비용 0 가능. */
export function makeGenPort(anthropicKey: string): LlmGenPort {
  const genAnthropic = async (prompt: string): Promise<string> => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error(`anthropic_${r.status}`);
    const j = (await r.json()) as { content?: Array<{ text?: string }> };
    return j.content?.[0]?.text ?? "{}";
  };
  const genQwen = async (prompt: string): Promise<string> => {
    const r = await fetch("http://localhost:11434/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3-coder:30b", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } }),
    });
    if (!r.ok) throw new Error(`qwen_${r.status}`);
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return j.choices?.[0]?.message?.content ?? "{}";
  };
  return { generate: anthropicKey ? genAnthropic : genQwen };
}

/** 씬 골격 생성 — intent는 입력값으로 강제 고정(생성은 LLM, 판정은 골격). genPort로 공급자 추상. */
export async function genScene(context: string, intent: string, strictness: Strictness, character: string, genPort: LlmGenPort): Promise<Partial<Scene>> {
  const prompt = `너는 일본어 학습 게임 콘텐츠 디자이너다. 아래로 씬 골격 1개를 JSON으로만 출력.
캐릭터: ${character}
맥락: "${context}"
의도(intent): "${intent}"  ← 이 값을 그대로 복사. 절대 바꾸지 마라.
난이도(strictness): ${strictness} — ${BAND_HINT[strictness]}
규칙: allowedExpressions(일본어)·beats만 생성. beats는 npc 선창으로 시작하고 user 비트를 최소 1개 포함.
JSON: {"intent":"${intent}","allowedExpressions":["..."],"beats":[{"kind":"npc","line":"..."},{"kind":"user"}]}
JSON만, 설명 없이.`;
  const text = await genPort.generate(prompt);
  const m = text.match(/\{[\s\S]*\}/); // 앞뒤 설명이 섞여도 JSON 본체만 추출
  return JSON.parse(m ? m[0] : "{}") as Partial<Scene>;
}
