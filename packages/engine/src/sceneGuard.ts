// 콘텐츠 공장 검수 게이트(CLAUDE.md §0·§4) — 생성된 씬이 골격을 지키는지 순수 검증.
// "골격 고정"은 프롬프트 신뢰가 아니라 이 함수가 보증한다: judge가 쓸 allowedExpressions가
// 비거나 일본어가 아니거나 음성 게이트(user beat)가 없으면 캐시로 승급하지 못한다.
import type { Scene, Strictness } from "./types";

export type GuardLevel = "fail" | "warn";
export interface GuardFlag { level: GuardLevel; code: string; msg: string }
export interface GuardReport { ok: boolean; flags: GuardFlag[] }

/** strictness별 허용표현 권장 개수 밴드 — 벗어나면 warn(거부는 아님). 슬라이더 위치의 의미. */
export const EXPR_BANDS: Record<Strictness, { min: number; max: number }> = {
  strict: { min: 1, max: 2 },
  normal: { min: 3, max: 5 },
  lenient: { min: 6, max: 12 },
};

const JA = /[぀-ヿ一-鿿ー]/; // 히라가나·카타카나·CJK 한자·장음부(일본어 판별)

export interface GuardContext {
  /** 작가가 입력한 의도(골격) — 생성 intent가 이걸 벗어나면 fail */
  expectedIntent: string;
  strictness: Strictness;
}

/** 생성된 씬 골격을 검수 → 캐시 승급 가능 여부(ok)와 플래그. 순수함수(테스트 가능). */
export function validateGeneratedScene(scene: Partial<Scene>, ctx: GuardContext): GuardReport {
  const flags: GuardFlag[] = [];
  const push = (level: GuardLevel, code: string, msg: string): void => { flags.push({ level, code, msg }); };

  // 1) intent 골격 고정 — 생성물이 입력 의도를 바꾸면 fail(슬라이더 데모의 "라멘에/다이키에게" 흔들림 차단)
  const gi = (scene.intent ?? "").trim();
  const want = ctx.expectedIntent.trim();
  if (!gi) push("fail", "intent_empty", "intent가 비어 있음");
  else if (gi !== want) push("fail", "intent_drift", `intent가 입력과 다름: "${gi}" ≠ "${want}"`);

  // 2) allowedExpressions — judge가 양자화할 풀. 비거나 비(非)일본어면 판정 불가 → fail
  const expr = scene.allowedExpressions ?? [];
  if (expr.length === 0) push("fail", "expr_empty", "allowedExpressions가 비어 judge가 판정 불가");
  const nonJa = expr.filter((e) => !JA.test(e));
  if (nonJa.length) push("fail", "expr_not_ja", `일본어가 아닌 표현 ${nonJa.length}개: ${nonJa.slice(0, 2).join(", ")}`);
  const dup = expr.length - new Set(expr.map((e) => e.trim())).size;
  if (dup > 0) push("warn", "expr_dup", `중복 표현 ${dup}개`);
  const band = EXPR_BANDS[ctx.strictness];
  if (expr.length > 0 && expr.length < band.min) push("warn", "expr_few", `허용표현 ${expr.length}개 — ${ctx.strictness} 권장 ${band.min}~${band.max}개보다 적음`);
  if (expr.length > band.max) push("warn", "expr_many", `허용표현 ${expr.length}개 — ${ctx.strictness} 권장 ${band.min}~${band.max}개 초과`);

  // 3) 음성 게이트(§0) — user 발화 비트가 최소 1개(말해야 진행). 없으면 fail
  const beats = scene.beats ?? [];
  const userBeats = beats.filter((b) => b.kind === "user").length;
  if (userBeats === 0) push("fail", "no_user_beat", "user 발화 비트가 없어 음성 게이트가 성립 안 함");

  // 4) NPC 선창 — 첫 비트가 npc면 자연스러움(없으면 warn, 거부는 아님)
  const first = beats[0]?.kind;
  if (beats.length > 0 && first !== "npc" && first !== "npc_push") push("warn", "no_npc_open", "첫 비트가 NPC 선창이 아님");

  return { ok: flags.every((f) => f.level !== "fail"), flags };
}
