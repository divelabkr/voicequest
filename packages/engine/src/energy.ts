// 에너지 — 가벼운 페이싱 장치. 순수.
// ⚠️ 레드팀: 과금 게이트로 쓰지 말 것(학습앱 역효과). 페이싱·습관 리듬용으로만.
export interface EnergyState {
  current: number;
  max: number;
}

export function canStart(e: EnergyState): boolean {
  return e.current > 0;
}

export function spend(e: EnergyState, amount = 1): EnergyState {
  return { ...e, current: Math.max(0, e.current - amount) };
}

export function recharge(e: EnergyState, amount: number): EnergyState {
  return { ...e, current: Math.min(e.max, e.current + amount) };
}
