// 콜백/슬롯 — 순수. 이벤트(이전 발화·등급)로 NPC가 "기억"하는 맞춤감. 비용 0(캐시 골격 + 슬롯).
// market-data: "최애가 날 기억한다" = 감정축 과금. 무한 맞춤(런타임 생성) 대신 유한 캐시 + 데이터 참조.
import type { GameEvent, Grade } from "./types";

function gv(g: Grade): number {
  return g === "S" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0;
}

function bestTurnGrade(events: GameEvent[]): Grade | null {
  let best: Grade | null = null;
  for (const e of events) {
    if (e.type === "turn_spoken" && (!best || gv(e.grade) > gv(best))) best = e.grade;
  }
  return best;
}

/** 콜백 키 선택 — 캐시된 콜백 변주풀에서 어느 대사를 끼울지(첫방문/잘했음/재방문). */
export function pickCallback(events: GameEvent[]): "first_time" | "did_well" | "welcome_back" {
  const cleared = events.some((e) => e.type === "episode_clear");
  if (!cleared) return "first_time";
  const best = bestTurnGrade(events);
  return best === "S" || best === "A" ? "did_well" : "welcome_back";
}

/** 슬롯 채우기 — 캐시 골격 템플릿에 추출 슬롯만 끼움(완전 자유생성 X, 규칙4). {key}→value */
export function fillSlots(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? `{${k}}`);
}
