import { describe, it, expect } from "vitest";
import { admit, canSpendTurn, recordTurn, openSlots, STAGE_LIMITS } from "./access";

describe("access (단계적 배포 제어)", () => {
  it("alpha는 25명까지 입장, 26번째는 웨이팅리스트", () => {
    expect(admit("alpha", 24, false, 0).status).toBe("active");
    const r = admit("alpha", 25, false, 3);
    expect(r.status).toBe("waitlisted");
    expect(r.waitlistPosition).toBe(4);
  });

  it("기존 멤버는 상한과 무관하게 입장", () => {
    expect(admit("alpha", 25, true, 0).status).toBe("active");
  });

  it("일일 턴 캡 초과 시 차단(API 폭주 방어)", () => {
    const today = "2026-06-18";
    expect(canSpendTurn({ turnsToday: 29, dayStamp: today }, "alpha", today)).toBe(true);
    expect(canSpendTurn({ turnsToday: 30, dayStamp: today }, "alpha", today)).toBe(false);
  });

  it("날짜가 바뀌면 사용량 리셋", () => {
    expect(canSpendTurn({ turnsToday: 99, dayStamp: "2026-06-17" }, "alpha", "2026-06-18")).toBe(true);
    expect(recordTurn({ turnsToday: 99, dayStamp: "2026-06-17" }, "2026-06-18")).toEqual({
      turnsToday: 1,
      dayStamp: "2026-06-18",
    });
  });

  it("단계별 상한: pilot 300·유료, ga 무제한", () => {
    expect(STAGE_LIMITS.pilot.capacity).toBe(300);
    expect(STAGE_LIMITS.pilot.paid).toBe(true);
    expect(STAGE_LIMITS.alpha.paid).toBe(false);
    expect(openSlots("alpha", 20)).toBe(5);
    expect(openSlots("ga", 1_000_000)).toBe(Infinity);
  });
});
