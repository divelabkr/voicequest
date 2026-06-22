// VoiceQuest 코어 타입 — 판정 골격이 곧 계약 (CLAUDE.md §3, §6).
// 엔진은 프레임워크/공급자를 모른다. 순수 타입만.

export type Grade = "S" | "A" | "B" | "C";

/** 약점 태그 — Result 인사이트 + 발음 효능감(화폐화 1위) */
export type WeaknessTag = "pronunciation" | "length" | "naturalness" | "politeness";

/** JLPT 난이도(간접 역량 — 어휘/문법/청해). 사다리 오름차순: N5<N4<N3<N2<N1 */
export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

/** 씬 난이도 = JLPT 사다리 + 회화 정점(OPIc). 씬 태깅용 */
export type SceneLevel = JlptLevel | "OPIc";

/** OPIc 추정 등급(직접 역량 — 발화). Novice→Intermediate→Advanced */
export type OpicRating = "NL" | "NM" | "NH" | "IL" | "IM" | "IH" | "AL";

/** 판정 엄격도 — OPIc 동적 난이도가 조정 */
export type Strictness = "lenient" | "normal" | "strict";

/** 발화 성격 — 안전 NPC가 분기(엉뚱·못된 말 흡수). harmful만 하드 게이트 */
export type UtteranceCategory = "normal" | "offtopic" | "inappropriate" | "harmful";

/** 씬 = 판정 골격(고정). intent·required_slots·allowed_expressions */
export interface Scene {
  id: string;
  intent: string;
  /** 씬 상황 세부 — 빌드타임 대사 생성 힌트(골격 아님) */
  situation?: string;
  /** 레지스터 — judge가 맥락 정답을 알도록(또래물=반말이 정답, 안내=정중체) */
  register?: "polite" | "casual";
  requiredSlots: string[];
  /** 허용 표현 — judge는 이 골격 + 의미 충족으로만 등급 산정(자유 판단 금지) */
  allowedExpressions: string[];
  /** 난이도 사다리 — 역량 추정·다음 도전 추천에 사용(없으면 미집계). 골격 전이는 안 흔듦 */
  level?: SceneLevel;
  /** 충족 시 다음 씬(마지막 씬은 없음) */
  nextSceneId?: string;
  /** 모범답안 — 선창→후창 회복 루프용 */
  modelAnswer?: string;
  /** 고난이도 OPIc 챌린지(긴 발화 요구). 있으면 allowedExpressions 대신 rubric으로 평가 */
  challenge?: SceneChallenge;
  /** 발화 트리 — NPC 능동 발화·끼어듦 무시·무반응 등 대화 엣지. 없으면 단순 [user] */
  beats?: DialogueBeat[];
}

/** 발화 트리 노드 — 사람 대화의 엣지를 표현(음성 게이트는 user에만) */
export type DialogueBeat =
  | { kind: "npc"; line: string }           // NPC 능동 발화(유저 입력 불필요 → 자동 진행)
  | { kind: "user" }                        // 유저 발화 대기 → judge
  | { kind: "npc_push"; line: string }      // 유저가 끼어들어도 무시하고 밀어붙임
  | { kind: "npc_silent"; holdMs: number }; // 듣고도 대답 안 함(침묵 연출)

/** OPIc 준하는 고난이도 챌린지 — 긴 발화·내용·정중도를 rubric으로 평가 */
export interface SceneChallenge {
  type: "opic";
  rubric: string;
  minSentences: number;
}

/** 표면 변주(변동) — NPC 톤·시간대 등. 골격은 안 바뀜 */
export interface Modifier {
  tone?: string;
  contextSeed?: string;
}

/** 엔딩 분기 — 호감도 누적으로 결정 */
export interface Ending {
  id: string;
  minAffinity: number;
  title: string;
}

/** 에피소드 = 판정 골격 묶음 + 엔딩. 교체·UGC 확장 가능 */
/**
 * 콘텐츠 생성 가이드 — 작가는 텍스트 대신 이것만 정의(레드팀 1순위 병목 해결).
 * 빌드타임 LLM이 가이드 안에서 대사 변주를 생성·검수·캐시(규칙3 캐시·규칙4 골격 유지).
 * 런타임 자유생성 X(환각·비용·판정붕괴). judge는 골격 판정 그대로.
 */
export interface GenerationGuide {
  persona: string; // 캐릭터 성격·말투
  tone: string; // 레지스터·어조
  world: string; // 세계관·무대
  guardrails: string[]; // 금지(무례·OOC·세계관 이탈)
}

export interface Episode {
  id: string;
  title: string;
  character: string;
  /** 빌드타임 대사 생성 가이드(없으면 레거시 수작업 콘텐츠) */
  guide?: GenerationGuide;
  scenes: Scene[];
  endings: Ending[];
}

export interface JudgeInput {
  transcript: string;
  /** STT 신뢰도 0~1 — 신뢰도 게이트용(억울한 오답 방어) */
  sttConfidence: number;
  scene: Scene;
  modifier: Modifier;
  strictness: Strictness;
  affinity: number;
}

export interface JudgeResult {
  grade: Grade;
  matched: string[];
  weaknessTags: WeaknessTag[];
  affinityDelta: number;
  /** 다음 씬 ID, 또는 "recovery"(미충족 흡수) */
  nextSceneId: string;
  reason: string;
  /** 발화 성격 — 안전 NPC 분기용(없으면 normal 취급) */
  category?: UtteranceCategory;
}

// ── 이벤트 소싱 (CLAUDE.md §6) — append-only 불변 로그 ──
export type GameEvent =
  | { type: "turn_spoken"; sceneId: string; transcript: string; grade: Grade; weakness: WeaknessTag[]; level?: SceneLevel; ts: number }
  | { type: "scene_advance"; from: string; to: string; modifier?: string; ts: number }
  | { type: "episode_clear"; episodeId: string; stars: number; ending: string; affinity: number; ts: number }
  | { type: "energy_spent"; amount: number; ts: number }
  | { type: "energy_recharged"; amount: number; ts: number };

// ── 화면용 read model (CLAUDE.md §6) ──
export interface Stats6 {
  pronunciation: number;
  vocabulary: number;
  grammar: number;
  naturalness: number;
  speed: number;
  challenge: number;
}

/**
 * 시험 역량 추정 — "놀다 보니 시험 대비됨"(숨은 의도). DNA는 "쉽게 외국어",
 * 시험은 배경 가정이라 메인이 아닌 부가 인사이트로만 노출.
 * JLPT=간접(어휘/문법/청해), OPIc=직접(발화 챌린지).
 */
export interface ExamReadiness {
  jlpt: {
    /** 통과율 임계를 넘긴 가장 높은 레벨(없으면 "-") */
    estimated: JlptLevel | "-";
    /** 레벨별 통과(B 이상)/총 시도 */
    byLevel: Partial<Record<JlptLevel, { pass: number; total: number }>>;
  };
  opic: {
    /** OPIc 챌린지 최고 등급에서 추정한 회화 레이팅 */
    estimated: OpicRating;
    /** 챌린지 최고 등급(미도전이면 "-") */
    best: Grade | "-";
  };
}

export interface ReadModel {
  stats6: Stats6;
  /** 캐릭터별 호감도 (daiki: n, ...) */
  affinity: Record<string, number>;
  progress: { unlocked: string[]; streak: number };
  /** 시험 역량 추정(배경 가정 — 숨은 의도) */
  examReadiness: ExamReadiness;
}
