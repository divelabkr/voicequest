// 에피소드 진행 상태머신 — 순수. judge 결과로 씬 전이·호감도 누적·엔딩 분기.
// beatIndex: 씬 내 발화 트리 위치(runTurn이 진행, 씬 전이 시 0으로 리셋).
import type { Episode, JudgeResult, GameEvent, Grade } from "./types";
import { findScene, resolveEnding } from "./episode";

export interface GameState {
  episodeId: string;
  currentSceneId: string;
  beatIndex: number;
  affinity: number;
  turnCount: number;
  recoveryFail: number; // recovery 연속 실패 누적(통과 시 0) — recoveryStep 단계 상승(W6: 막힐수록 더 도움)
  done: boolean;
  ending?: string;
}

export interface AdvanceResult {
  state: GameState;
  events: GameEvent[];
}

export function initState(ep: Episode): GameState {
  const first = ep.scenes[0];
  if (!first) throw new Error("empty_episode");
  return {
    episodeId: ep.id,
    currentSceneId: first.id,
    beatIndex: 0,
    affinity: 0,
    turnCount: 0,
    recoveryFail: 0,
    done: false,
  };
}

function gradeToStars(grade: Grade): number {
  return grade === "S" ? 3 : grade === "A" ? 2 : 1;
}

/** judge 결과로 상태 전이. recovery=제자리(흡수), 충족=다음 씬(beatIndex 리셋) or 클리어. */
export function advance(
  state: GameState,
  result: JudgeResult,
  ep: Episode,
  ts: number,
): AdvanceResult {
  if (state.done) return { state, events: [] };
  const scene = findScene(ep, state.currentSceneId);
  if (!scene) return { state, events: [] };

  const affinity = state.affinity + result.affinityDelta;
  const turnCount = state.turnCount + 1;
  const events: GameEvent[] = [];

  // recovery — 같은 씬·beat 유지(틀려도 흡수)
  if (result.nextSceneId === "recovery") {
    return { state: { ...state, affinity, turnCount, recoveryFail: state.recoveryFail + 1 }, events };
  }

  // 충족 — 콘텐츠가 정의한 다음 씬으로(beatIndex 리셋)
  const nextId = scene.nextSceneId;
  if (!nextId) {
    const ending = resolveEnding(ep, affinity);
    const stars = gradeToStars(result.grade);
    events.push({ type: "scene_advance", from: state.currentSceneId, to: "clear", ts });
    events.push({ type: "episode_clear", episodeId: ep.id, stars, ending, affinity, ts });
    return { state: { ...state, affinity, turnCount, done: true, ending }, events };
  }

  events.push({ type: "scene_advance", from: state.currentSceneId, to: nextId, ts });
  return {
    state: { ...state, currentSceneId: nextId, beatIndex: 0, affinity, turnCount, recoveryFail: 0 },
    events,
  };
}
