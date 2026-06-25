// 프리토크 토픽카드 — topicToScene(OPIc pseudo-scene) + pickTopic(순환) 단위 테스트.
import { describe, it, expect } from "vitest";
import { topicToScene, pickTopic, DAIKI_TOPICS, MIDORI_TOPICS, SORA_TOPICS, CHAR_TOPICS, topicsForChar, type Topic } from "../src/freetalk";

describe("프리토크 토픽카드", () => {
  it("topicToScene: OPIc challenge + allowedExpressions 빈(자유발화 rubric 경로)", () => {
    const t: Topic = { id: "x", question: "好き？", rubric: "감상", minSentences: 1 };
    const s = topicToScene(t);
    expect(s.allowedExpressions).toEqual([]); // 자유 → fastMatch 아님
    expect(s.challenge?.type).toBe("opic");
    expect(s.challenge?.rubric).toBe("감상");
    expect(s.intent).toBe("好き？");
  });

  it("pickTopic: 안 쓴 토픽 우선", () => {
    const used = ["origin", "food"];
    const t = pickTopic(DAIKI_TOPICS, used);
    expect(t).not.toBeNull();
    expect(used).not.toContain(t!.id);
  });

  it("pickTopic: 다 쓰면 처음부터 순환(무한 대화)", () => {
    const allIds = DAIKI_TOPICS.map((t) => t.id);
    expect(pickTopic(DAIKI_TOPICS, allIds)).toBe(DAIKI_TOPICS[0]);
  });

  it("pickTopic: 빈 풀 → null", () => {
    expect(pickTopic([], [])).toBeNull();
  });

  it("DAIKI_TOPICS: minSentences 1(진입 쉽게) + 5개 이상", () => {
    expect(DAIKI_TOPICS.every((t) => t.minSentences === 1)).toBe(true);
    expect(DAIKI_TOPICS.length).toBeGreaterThanOrEqual(5);
  });

  it("캐릭터별 토픽 — midori·sora 각 5개, minSentences 1(캐시카우 ×N)", () => {
    expect(MIDORI_TOPICS.length).toBe(5);
    expect(SORA_TOPICS.length).toBe(5);
    expect([...MIDORI_TOPICS, ...SORA_TOPICS].every((t) => t.minSentences === 1)).toBe(true);
    expect(CHAR_TOPICS.daiki).toBe(DAIKI_TOPICS);
  });

  it("topicsForChar — 캐릭터 매핑 + 미지 캐릭터는 daiki 폴백", () => {
    expect(topicsForChar("midori")).toBe(MIDORI_TOPICS);
    expect(topicsForChar("sora")).toBe(SORA_TOPICS);
    expect(topicsForChar("unknown")).toBe(DAIKI_TOPICS);
  });
});
