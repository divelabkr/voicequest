// 데일리 3마디 — 마이크로 발화 습관(DNA: 쉽게 외국어). 순수.
// Duolingo 스트릭 + Speak 발화 + Anki SRS(라이트너)를 "목적 있는 한 마디"로 결합.
import type { Grade } from "./types";

/** 라이트너 박스별 복습 간격(일) — 맞을수록 길어짐(간격 반복). */
export const SRS_INTERVALS_DAYS = [0, 1, 2, 4, 8, 16];

/** 발화 카드 — 오늘 말할 한 마디 + SRS 상태. */
export interface DailyCard {
  expression: string; // 발화 표현(일본어)
  meaning: string; // 한국어 뜻
  yomi?: string; // 후리가나(히라가나) — 한자 한글발음 변환용
  sceneRef?: string; // 출처(에피소드/씬) — 게임과 연계
  box: number; // 0~5 라이트너 박스(높을수록 잘 암)
  dueDay: number; // 다음 복습 day
}

export interface DailyState {
  cards: DailyCard[];
  streak: number; // 연속 완료 일수
  lastDoneDay: number; // 마지막 완료 day(0=없음)
}

/** KST 기준 day(epoch/하루). 비교용 정수. */
export const dayOf = (ts: number): number => Math.floor((ts + 9 * 3_600_000) / 86_400_000);

/** 오늘의 N마디 — 복습 due(box 낮은 것 우선) → 부족하면 신규 카드(box 0)로 채움. */
export function todaysCards(state: DailyState, now: number, count = 3): DailyCard[] {
  const today = dayOf(now);
  const due = state.cards
    .filter((c) => c.dueDay <= today)
    .sort((a, b) => a.box - b.box || a.dueDay - b.dueDay);
  return due.slice(0, count);
}

/** 발화 판정으로 SRS 갱신 — B 이상이면 박스+1(간격↑), 미만이면 박스 0(즉시 복습). */
export function reviewCard(card: DailyCard, grade: Grade, now: number): DailyCard {
  const correct = grade === "S" || grade === "A" || grade === "B";
  const box = correct ? Math.min(SRS_INTERVALS_DAYS.length - 1, card.box + 1) : 0;
  return { ...card, box, dueDay: dayOf(now) + (SRS_INTERVALS_DAYS[box] ?? 1) };
}

/** 오늘 완료 처리 + 스트릭 — 어제 완료면 +1, 오늘 이미면 유지, 그 외 1로 리셋. */
export function completeToday(state: DailyState, now: number): DailyState {
  const today = dayOf(now);
  if (state.lastDoneDay === today) return state;
  const streak = state.lastDoneDay === today - 1 ? state.streak + 1 : 1;
  return { ...state, streak, lastDoneDay: today };
}

/** 신규 카드 생성 — 에피소드 표현을 데일리 풀에 편입(게임↔데일리 연계). */
export function makeCard(expression: string, meaning: string, sceneRef?: string, yomi?: string): DailyCard {
  return { expression, meaning, yomi, sceneRef, box: 0, dueDay: 0 };
}
