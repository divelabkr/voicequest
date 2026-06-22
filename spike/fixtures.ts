// 판정 모델 스파이크 픽스처 — ep_01 s1(다이키 식당, 인원 주문).
// ⚠️ expect(기대 등급)는 잠정 기준 — 원어민 감수(콘텐츠 킬 테스트)로 확정해야 진짜 정답.
import type { Scene, Grade } from "@voicequest/engine";

export const SCENE: Scene = {
  id: "s1_order_entry",
  intent: "점원에게 인원 수를 전달하고 자리를 안내받기",
  requiredSlots: ["인원수"],
  allowedExpressions: ["一人です", "ひとり", "1人です"],
};

export type Utterance = {
  transcript: string;
  confidence: number;
  expect: Grade | "recovery";
  note: string;
};

// 초보 일본어 10발화 — 정답/캐주얼/조사어색/무관/저신뢰(게이트) 혼합
export const UTTERANCES: Utterance[] = [
  { transcript: "一人です", confidence: 0.95, expect: "S", note: "정중·정답" },
  { transcript: "ひとりです", confidence: 0.9, expect: "S", note: "히라가나 정중" },
  { transcript: "ひとり", confidence: 0.88, expect: "A", note: "캐주얼" },
  { transcript: "1人です", confidence: 0.9, expect: "S", note: "숫자 표기" },
  { transcript: "いちにんです", confidence: 0.85, expect: "B", note: "부자연한 읽기" },
  { transcript: "一人で", confidence: 0.8, expect: "B", note: "조사 어색" },
  { transcript: "ひとりだ", confidence: 0.82, expect: "A", note: "반말이나 의미 통함" },
  { transcript: "えっと、一人です", confidence: 0.78, expect: "S", note: "주저 포함 정답" },
  { transcript: "わかりません", confidence: 0.9, expect: "recovery", note: "무관한 응답" },
  { transcript: "ひと…", confidence: 0.45, expect: "recovery", note: "STT 저신뢰(게이트)" },
];
