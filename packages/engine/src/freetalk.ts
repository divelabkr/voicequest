// 프리토크 — 토픽카드(NPC가 던지는 질문) + OPIc rubric 평가. 순수.
// §0 준수: NPC 질문·리액션은 캐시(골격 고정), 자유는 "유저 발화"에만. 완전 자유생성 대화 아님.
// 채점은 judge() 재사용 — 토픽을 OPIc challenge pseudo-scene으로 감싸 rubric 평가(allowedExpressions 없음).
import type { Scene } from "./types";

/** 토픽카드 — NPC가 먼저 던지는 질문 + 평가 기준. question은 캐시 음성 키(빌드타임 생성). */
export interface Topic {
  id: string;
  question: string; // NPC 질문(일본어) — 캐시 음성
  rubric: string; // OPIc 평가 기준(judge LLM)
  minSentences: number; // 최소 문장(진입 쉽게 1)
}

/** 토픽 → judge용 pseudo-scene(OPIc challenge). 자유발화를 rubric으로 평가 — fastMatch 안 통하고 LLM rubric 경로. */
export function topicToScene(topic: Topic, register: "polite" | "casual" = "casual"): Scene {
  return {
    id: `freetalk:${topic.id}`,
    intent: topic.question,
    requiredSlots: [],
    allowedExpressions: [], // 자유 발화 → allowedExpressions 매칭 아님, rubric으로
    register,
    challenge: { type: "opic", rubric: topic.rubric, minSentences: topic.minSentences },
  };
}

/** 안 쓴 토픽 우선, 다 쓰면 처음부터 순환(무한 대화 — 토픽 풀 재사용). */
export function pickTopic(pool: Topic[], usedIds: string[]): Topic | null {
  if (pool.length === 0) return null;
  const fresh = pool.filter((t) => !usedIds.includes(t.id));
  return (fresh.length > 0 ? fresh : pool)[0]!;
}

/** MVP 기본 토픽 풀(다이키 — 라멘집 캐주얼). minSentences 1·rubric 관대 = 진입 쉽게(밸런스③ 정신). 확장은 content/freetalk. */
export const DAIKI_TOPICS: Topic[] = [
  { id: "origin", question: "君、出身はどこ？", rubric: "출신지를 1문장 이상으로 자연스럽게(반말/정중 무관). 시도하면 통과", minSentences: 1 },
  { id: "food", question: "好きな食べ物ってある？", rubric: "좋아하는 음식 + 간단한 이유나 감상. 1가지라도 말하면 통과", minSentences: 1 },
  { id: "japan", question: "日本に来てどう？慣れた？", rubric: "일본 생활·인상에 대한 소감 1가지 이상", minSentences: 1 },
  { id: "ramen", question: "うちのラーメン、どうだった？", rubric: "라멘 맛·감상을 구체적으로 1문장 이상", minSentences: 1 },
  { id: "weekend", question: "休みの日は何してるの？", rubric: "주말·취미 활동 1가지 이상", minSentences: 1 },
];

/** 미도리 — 환승역/교통 맥락(ep_02). */
export const MIDORI_TOPICS: Topic[] = [
  { id: "destination", question: "今日はどこまで行くの？", rubric: "목적지·행선지를 1문장 이상. 시도하면 통과", minSentences: 1 },
  { id: "transfer", question: "乗り換え、迷わなかった？", rubric: "환승·길찾기 경험이나 감상 1가지", minSentences: 1 },
  { id: "city", question: "東京の電車、どう思う？", rubric: "도쿄 교통·도시 인상 1가지 이상", minSentences: 1 },
  { id: "hometown_transit", question: "君の国の交通はどんな感じ？", rubric: "고향 교통수단 1가지 이상", minSentences: 1 },
  { id: "trip", question: "電車でどこか遠くに行きたい？", rubric: "가고 싶은 곳·여행 1가지", minSentences: 1 },
];

/** 소라 — 학교/방과후 맥락(ep_03). */
export const SORA_TOPICS: Topic[] = [
  { id: "club", question: "部活とか入ってる？", rubric: "동아리·방과후 활동 1가지 이상. 시도하면 통과", minSentences: 1 },
  { id: "study", question: "今、何の勉強してるの？", rubric: "공부·과목 1가지 이상", minSentences: 1 },
  { id: "friends", question: "学校で仲いい子いる？", rubric: "친구·교우 관계 1가지", minSentences: 1 },
  { id: "after_school", question: "放課後はいつも何してる？", rubric: "방과후 일과 1가지 이상", minSentences: 1 },
  { id: "dream", question: "将来やりたいことある？", rubric: "장래희망·꿈 1가지", minSentences: 1 },
];

/** 캐릭터 → 토픽 풀. server가 에피소드 character로 선택(캐시카우를 캐릭터별로 확장). */
export const CHAR_TOPICS: Record<string, Topic[]> = { daiki: DAIKI_TOPICS, midori: MIDORI_TOPICS, sora: SORA_TOPICS };
export const topicsForChar = (char: string): Topic[] => CHAR_TOPICS[char] ?? DAIKI_TOPICS;
