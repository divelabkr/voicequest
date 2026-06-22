// 발화 트리 진행 — 순수. 사람 대화의 엣지(능동 발화·끼어듦 무시·무반응)를 beat 단위로.
// 음성 게이트(진행=말하기)는 user beat에만. 나머지는 연출(자동 진행 + 레이턴시 흡수).
import type { Scene, DialogueBeat } from "./types";

export interface BeatCursor {
  sceneId: string;
  beatIndex: number;
}

function beatsOf(scene: Scene): DialogueBeat[] {
  return scene.beats && scene.beats.length > 0 ? scene.beats : [{ kind: "user" }];
}

export function startCursor(scene: Scene): BeatCursor {
  return { sceneId: scene.id, beatIndex: 0 };
}

export function currentBeat(scene: Scene, cursor: BeatCursor): DialogueBeat | undefined {
  return beatsOf(scene)[cursor.beatIndex];
}

export function nextCursor(cursor: BeatCursor): BeatCursor {
  return { ...cursor, beatIndex: cursor.beatIndex + 1 };
}

/** 이 beat가 유저 발화를 기다리나? (음성 게이트는 user에만) */
export function awaitsUser(beat: DialogueBeat): boolean {
  return beat.kind === "user";
}

/** 이 beat가 유저 발화를 무시하나? (끼어듦 무시·무반응) */
export function ignoresUser(beat: DialogueBeat): boolean {
  return beat.kind === "npc_push" || beat.kind === "npc_silent";
}

/** 발화 트리 소진(씬의 beats 끝) */
export function isSceneEnd(scene: Scene, cursor: BeatCursor): boolean {
  return cursor.beatIndex >= beatsOf(scene).length;
}
