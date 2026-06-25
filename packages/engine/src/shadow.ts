// 따라하기(섀도잉) 모드 — 정답을 먼저 들려주고 따라 발화. 파라미터로 제시 단어가 달라진다. 순수.
// 엔드게임 1순위(레드팀 콘텐츠 병목 회피): 신규 콘텐츠 0으로 클리어한 표현을 SRS 복습·정착.
// 채점은 judge() 재사용 — 제시 표현이 곧 유일한 정답인 pseudo-scene을 만들어 fastMatch가 처리(골격 SSOT §4, 새 판정 로직 없음).
import type { Scene, SceneLevel } from "./types";
import type { DailyCard } from "./daily";
import { dayOf } from "./daily";

/** 입력 난도 — 듣고 따라(가장 쉬움) / 보고 읽기 / 받아쓰기(가장 어려움, 제시 숨김). */
export type ShadowMode = "listen" | "read" | "dictation";

/** 따라하기 파라미터 — 이 조합이 카드 풀을 좁혀 "제시 단어가 달라지는" 축(사용자 요청). */
export interface ShadowParams {
  level?: SceneLevel; // 난이도 필터(없으면 전체)
  theme?: string; // sceneRef 접두(에피소드/카테고리) 필터(없으면 전체)
  mode: ShadowMode;
  count: number; // 한 세션 카드 수
}

/** 파라미터로 카드 선택 — 복습 due(box 낮은 것) 우선 + 부족하면 신규로 채움. todaysCards의 필터 확장판. */
export function pickShadowCards(pool: DailyCard[], params: ShadowParams, now: number): DailyCard[] {
  const today = dayOf(now);
  let cand = pool;
  if (params.theme) cand = cand.filter((c) => (c.sceneRef ?? "").startsWith(params.theme!));
  if (params.level) cand = cand.filter((c) => c.level === params.level);
  const due = cand.filter((c) => c.dueDay <= today).sort((a, b) => a.box - b.box || a.dueDay - b.dueDay);
  const fresh = cand.filter((c) => c.dueDay > today).sort((a, b) => a.dueDay - b.dueDay);
  return [...due, ...fresh].slice(0, Math.max(1, params.count));
}

/** 따라하기 카드 → judge용 pseudo-scene. 제시 표현 = 유일한 allowedExpressions(=정답). judge() 그대로 재사용. */
export function cardToScene(card: DailyCard): Scene {
  return {
    id: `shadow:${card.sceneRef ?? "free"}`,
    intent: card.meaning,
    requiredSlots: [],
    allowedExpressions: [card.expression],
    modelAnswer: card.expression,
    level: card.level,
    register: /(です|ます|ください|ません|ました)/.test(card.expression) ? "polite" : "casual",
  };
}

/** 풀에 고유 레벨 목록(셀렉터 UI용). 카드에 level 없으면 제외. */
export function shadowLevels(pool: DailyCard[]): SceneLevel[] {
  const set = new Set<SceneLevel>();
  for (const c of pool) if (c.level) set.add(c.level);
  return [...set];
}

/** 풀에 고유 테마(sceneRef 접두) 목록(셀렉터 UI용). "ep_01_..." → "ep_01". */
export function shadowThemes(pool: DailyCard[]): string[] {
  const set = new Set<string>();
  for (const c of pool) {
    const ref = c.sceneRef ?? "";
    const m = ref.match(/^(ep_\d+)/);
    if (m) set.add(m[1]!);
  }
  return [...set];
}
