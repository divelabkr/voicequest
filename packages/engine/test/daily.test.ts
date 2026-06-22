import { describe, it, expect } from "vitest";
import { todaysCards, reviewCard, completeToday, makeCard, SRS_INTERVALS_DAYS } from "../src/daily";

const DAY = 86_400_000;
const at = (d: number): number => d * DAY - 9 * 3_600_000; // dayOf(at(d)) === d

describe("daily — 데일리 3마디 SRS·스트릭", () => {
  it("todaysCards: due 지난 카드를 box 낮은 순으로 N개", () => {
    const state = {
      cards: [
        makeCard("a", "뜻"), // box0 due0
        { ...makeCard("b", "뜻"), box: 2, dueDay: 5 },
        { ...makeCard("c", "뜻"), box: 1, dueDay: 3 },
        { ...makeCard("d", "뜻"), box: 0, dueDay: 100 }, // 미래 due → 제외
      ],
      streak: 0,
      lastDoneDay: 0,
    };
    expect(todaysCards(state, at(10), 3).map((c) => c.expression)).toEqual(["a", "c", "b"]);
  });

  it("reviewCard: B 이상이면 박스+1·간격↑, 미만이면 박스 0", () => {
    const c = { ...makeCard("x", "뜻"), box: 1, dueDay: 0 };
    const ok = reviewCard(c, "A", at(10));
    expect(ok.box).toBe(2);
    expect(ok.dueDay).toBe(10 + (SRS_INTERVALS_DAYS[2] ?? 0));
    expect(reviewCard(c, "C", at(10)).box).toBe(0);
  });

  it("completeToday: 어제 완료면 스트릭+1, 건너뛰면 리셋, 오늘 이미면 유지", () => {
    expect(completeToday({ cards: [], streak: 3, lastDoneDay: 9 }, at(10)).streak).toBe(4);
    expect(completeToday({ cards: [], streak: 3, lastDoneDay: 7 }, at(10)).streak).toBe(1);
    expect(completeToday({ cards: [], streak: 3, lastDoneDay: 10 }, at(10)).streak).toBe(3);
  });
});
