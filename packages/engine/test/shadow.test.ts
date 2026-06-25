// 따라하기(섀도잉) 모드 — 파라미터 카드 선택 + judge용 pseudo-scene 변환 단위 테스트.
// 핵심 계약: 파라미터로 제시 단어가 달라진다(필터) / 제시 표현=유일 정답(cardToScene) / 복습 due 우선.
import { describe, it, expect } from "vitest";
import { pickShadowCards, cardToScene, shadowLevels, shadowThemes } from "../src/shadow";
import { makeCard, dayOf, type DailyCard } from "../src/daily";

const NOW = 1_700_000_000_000; // 고정 타임스탬프(Date.now 미사용 — 재현성)
const TODAY = dayOf(NOW);

// 카드 풀 — 에피소드 표현을 makeCard로 편입(box/dueDay는 SRS 상태로 덮어씀)
function pool(): DailyCard[] {
  return [
    { ...makeCard("いらっしゃいませ", "어서오세요", "ep_01_daiki_diner:s1", "いらっしゃいませ", "N5"), box: 0, dueDay: TODAY }, // due, box0(최우선)
    { ...makeCard("ラーメンください", "라멘 주세요", "ep_01_daiki_diner:s2", "ラーメンください", "N5"), box: 3, dueDay: TODAY }, // due, box3(후순위)
    { ...makeCard("おすすめは何ですか", "추천이 뭐예요", "ep_01_daiki_diner:s3", undefined, "N4"), box: 1, dueDay: TODAY }, // due, N4
    { ...makeCard("つぎはどこですか", "다음은 어디예요", "ep_02_midori_transit:s1", undefined, "N4"), box: 0, dueDay: TODAY + 5 }, // 신규(미래 due)
  ];
}

describe("pickShadowCards — 파라미터로 제시 단어가 달라진다", () => {
  it("theme 필터: ep_01 접두만 선택(ep_02 제외)", () => {
    const cards = pickShadowCards(pool(), { theme: "ep_01", mode: "listen", count: 10 }, NOW);
    expect(cards.length).toBe(3);
    expect(cards.every((c) => c.sceneRef!.startsWith("ep_01"))).toBe(true);
  });

  it("level 필터: N5만 선택", () => {
    const cards = pickShadowCards(pool(), { level: "N5", mode: "listen", count: 10 }, NOW);
    expect(cards.length).toBe(2);
    expect(cards.every((c) => c.level === "N5")).toBe(true);
  });

  it("복습 우선: due 카드 중 box 낮은 것이 먼저(간격반복 SRS)", () => {
    const cards = pickShadowCards(pool(), { mode: "listen", count: 3 }, NOW);
    // due 3장(box 0,1,3) → box 오름차순, 미래 due(ep_02)는 뒤로 밀림
    expect(cards[0]!.box).toBe(0);
    expect(cards[1]!.box).toBe(1);
    expect(cards[2]!.box).toBe(3);
    expect(cards.find((c) => c.sceneRef!.startsWith("ep_02"))).toBeUndefined();
  });

  it("count 제한 + 신규로 채움: due 부족하면 미래 due 카드 보충", () => {
    const only = pool().filter((c) => c.sceneRef!.startsWith("ep_02")); // 미래 due 1장뿐
    const cards = pickShadowCards(only, { mode: "listen", count: 3 }, NOW);
    expect(cards.length).toBe(1); // due 없어도 신규(fresh)로 1장 반환
    expect(cards[0]!.sceneRef).toContain("ep_02");
  });

  it("count는 최소 1 보장(0 요청도 1장)", () => {
    const cards = pickShadowCards(pool(), { mode: "listen", count: 0 }, NOW);
    expect(cards.length).toBe(1);
  });
});

describe("cardToScene — 제시 표현이 곧 유일 정답(judge 재사용)", () => {
  it("allowedExpressions = [카드 표현], intent = 뜻", () => {
    const card = makeCard("ラーメンください", "라멘 주세요", "ep_01_daiki_diner:s2", undefined, "N5");
    const scene = cardToScene(card);
    expect(scene.allowedExpressions).toEqual(["ラーメンください"]);
    expect(scene.intent).toBe("라멘 주세요");
    expect(scene.modelAnswer).toBe("ラーメンください");
    expect(scene.level).toBe("N5");
  });

  it("register: です/ます 포함이면 polite, 아니면 casual", () => {
    expect(cardToScene(makeCard("一人です", "혼자예요")).register).toBe("polite");
    expect(cardToScene(makeCard("うまい", "맛있다")).register).toBe("casual");
  });

  it("challenge가 없어 fastMatch 경로로 채점됨(OPIc rubric 아님)", () => {
    const scene = cardToScene(makeCard("いらっしゃいませ", "어서오세요"));
    expect(scene.challenge).toBeUndefined();
  });
});

describe("셀렉터 헬퍼", () => {
  it("shadowThemes: ep_NN 접두만 고유 추출", () => {
    expect(shadowThemes(pool()).sort()).toEqual(["ep_01", "ep_02"]);
  });

  it("shadowLevels: 카드 level 고유 추출", () => {
    expect(shadowLevels(pool()).sort()).toEqual(["N4", "N5"]);
  });
});
