// 판정 엔진 진입점 — 순수. LlmPort를 주입받아 호출(SDK를 모른다).
// 절대규칙(CLAUDE.md §0): 자유 판단 금지 / 틀려도 분기로 흡수 / 음성 게이트 우회 금지.
import type { JudgeInput, JudgeResult } from "./types";
import type { LlmPort } from "./ports/Llm";

/**
 * STT 신뢰도 게이트 임계값.
 * 레드팀: 초보 L2 발화는 WER이 높아 "맞게 말해도 오인식"이 잦다.
 * 낮은 신뢰도는 오답이 아니라 recovery("다시?")로 흡수해 억울한 오답을 방어.
 * 실측값은 Phase 0.5 스파이크에서 튜닝(공개 일본어 L2 벤치 0건이라 직접 잰다).
 */
const STT_CONFIDENCE_FLOOR = 0.55;

export async function judge(input: JudgeInput, llm: LlmPort): Promise<JudgeResult> {
  // 1) 신뢰도 게이트 — 못 알아들었으면 판정 전에 recovery로 흡수
  if (input.sttConfidence < STT_CONFIDENCE_FLOOR) {
    return {
      grade: "C",
      matched: [],
      weaknessTags: [],
      affinityDelta: 0,
      nextSceneId: "recovery",
      reason: "low_stt_confidence",
    };
  }

  // 2) 골격 기반 LLM 판정 (어댑터가 Structured Outputs + Prompt Caching 처리)
  const result = await llm.judge(input);

  // 3) 미충족(골격 매칭 0 + C)이면 recovery로 흡수 — 틀려도 분기(절대규칙 #5)
  if (result.matched.length === 0 && result.grade === "C") {
    return { ...result, nextSceneId: "recovery" };
  }

  return result;
}

/**
 * 판정 규칙(공통 프롬프트) — 어댑터가 자기 포맷에 삽입.
 * 판정 정책이라 엔진(도메인)에 둔다. 어댑터 중복 제거 + 한 곳 수정.
 * recovery 트리거 포함: intent 무관 발화를 흡수(스파이크에서 발견한 공통 버그 수정).
 */
export const JUDGE_RULES = `당신은 일본어 회화 학습 게임의 판정자입니다.
오직 scene의 intent와 allowedExpressions 골격으로만 판정합니다. 자유 창작·자유 판단 금지.

등급:
- S = 정중체(です/ます체)이고 자연스러움. "〜です"·"〜ます"로 끝나는 정답은 S로 본다.
- A = 의미는 전달되나 반말(だ체·짧은 형)이거나 정중체가 아님.
- B = 어순·조사 오류, 또는 부자연한 읽기·표현(읽기가 틀리면 です로 끝나도 B).
- C = 골격 미충족.

판정 규칙:
- 의미가 충족되면 표면형이 allowedExpressions와 달라도 흡수해 matched에 근거를 남긴다(억울한 오답 방지).
- 발화가 scene.intent와 무관하거나(엉뚱한 대답·회피·"모르겠다" 등) 골격을 벗어나면 → grade="C", matched=[], nextSceneId="recovery".
- 골격을 충족하면 nextSceneId="next"(다음 진행), recovery가 아니다.
- weaknessTags는 pronunciation/length/naturalness/politeness 중 해당하는 것만.
- 발음(pronunciation)은 전사만으로 단정하지 말고 길이/자연도/정중함 위주로 판단.
- affinityDelta(호감도 변화)는 등급으로 정한다: S=+2, A=+1, B=0, C=-1.
- scene에 [고난이도 OPIc 챌린지]가 있으면 allowedExpressions 매칭이 아니라 rubric으로 평가한다: 발화 길이·내용 충실도·정중도·구성을 보고, minSentences 미만이거나 빈약하면 C(nextSceneId="recovery"), 기준을 충실히 채우면 A 또는 S.

- category로 발화 성격을 분류한다: normal(정상 시도)·offtopic(엉뚱·무관·회피)·inappropriate(무례·욕설·공격)·harmful(혐오·자해·위험). 대부분 normal이며, intent 무관은 offtopic.

반드시 JudgeResult JSON만 출력: {grade, matched, weaknessTags, affinityDelta, nextSceneId, reason, category}.`;
