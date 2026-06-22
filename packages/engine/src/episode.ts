// 에피소드 로더 — 순수 파서. 파일 IO(읽기)는 세션/어댑터가 담당, 여기선 검증만.
import type { Episode, Scene } from "./types";

export function parseEpisode(raw: unknown): Episode {
  const e = raw as Episode;
  if (!e || typeof e.id !== "string" || !Array.isArray(e.scenes) || e.scenes.length === 0) {
    throw new Error("invalid_episode: id/scenes 누락");
  }
  for (const s of e.scenes) {
    if (!s.id || !s.intent || !Array.isArray(s.allowedExpressions)) {
      throw new Error(`invalid_scene: ${s?.id ?? "?"}`);
    }
  }
  if (!Array.isArray(e.endings) || e.endings.length === 0) {
    throw new Error("invalid_episode: endings 누락");
  }
  return e;
}

/** 씬 ID로 조회 */
export function findScene(ep: Episode, sceneId: string): Scene | undefined {
  return ep.scenes.find((s) => s.id === sceneId);
}

/** 씬 골격 → 판정 프롬프트 텍스트(어댑터 공통). challenge 있으면 OPIc 기준 포함. */
export function sceneToPrompt(scene: Scene): string {
  const lines = [`scene.id: ${scene.id}`, `intent: ${scene.intent}`];
  if (scene.allowedExpressions.length) {
    lines.push(`allowedExpressions: ${scene.allowedExpressions.join(" | ")}`);
  }
  if (scene.challenge) {
    lines.push(`[고난이도 OPIc 챌린지] 평가기준: ${scene.challenge.rubric}`);
    lines.push(`최소 ${scene.challenge.minSentences}문장 이상의 길고 충실한 발화를 요구한다.`);
  }
  return lines.join("\n");
}

/** 호감도로 엔딩 결정 (minAffinity 내림차순 첫 매칭) */
export function resolveEnding(ep: Episode, affinity: number): string {
  const sorted = [...ep.endings].sort((a, b) => b.minAffinity - a.minAffinity);
  return sorted.find((e) => affinity >= e.minAffinity)?.id ?? sorted[sorted.length - 1]!.id;
}
