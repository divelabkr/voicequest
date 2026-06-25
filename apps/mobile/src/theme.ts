// 디자인 토큰 단일 출처 — 루트 DESIGN.md 명세를 RN 상수로 옮긴 것.
// 화면 코드는 색·radius를 직접 하드코딩하지 말고 여기 T.*만 참조한다(DESIGN.md 철칙).
export const T = {
  // Primary — UI 뼈대(차분·신뢰). 토글 ON·사용자 발화 버블·1차 버튼.
  primary: "#0f6e56",
  primaryInk: "#ffffff",
  primarySoft: "#e4f0eb",
  // Accent — 온기·행동. 마이크·시작하기 CTA·별점.
  accent: "#d85a30",
  accentInk: "#ffffff",
  accentSoft: "#faece7",
  // Neutral — 크림 베이지 베이스. 전체 배경=paper, 카드만 card(순백).
  paper: "#faf7f2",
  card: "#ffffff",
  ink: "#2c2c2a",
  muted: "#5f5e5a",
  hint: "#888780",
  line: "#e5e0d8",
  // Semantic — 상태 pill(연한 배경 + 진한 글씨).
  success: "#27500a",
  successBg: "#eaf3de",
  error: "#a32d2d",
  errorBg: "#fcebeb",
  warn: "#946011",
  warnBg: "#f7efdc",
  // Radius
  radiusSm: 8,
  radiusMd: 14,
  radiusLg: 20,
  radiusFull: 9999,
} as const;
