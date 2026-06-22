// content_cache 매니페스트 — 순수. dedup·용량 예산(CLAUDE.md §11).
// 빌드타임 산출물을 content-hash로 중복 제거하고 에피소드당 바이트 예산을 강제한다.

/** 에피소드당 압축 후 용량 예산 (§11: ≤ 8MB) */
export const EPISODE_BYTE_BUDGET = 8 * 1024 * 1024;

export type CacheKind = "image" | "music" | "voice";

export interface CacheEntry {
  /** 논리 키(scene/role 등 — 어느 자리에 쓰이나) */
  key: string;
  /** 콘텐츠/spec 해시 — dedup 기준(같으면 1벌만) */
  hash: string;
  url: string;
  bytes: number;
  format: string;
  kind: CacheKind;
}

export interface CacheManifest {
  episodeId: string;
  entries: CacheEntry[];
  totalBytes: number;
  withinBudget: boolean;
}

/** 결정적 문자열 해시(djb2) — spec/콘텐츠 dedup용. crypto 비의존(순수·테스트 가능). */
export function assetHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 동일 hash 자산은 1벌만 남기고(참조 공유), 총량·예산을 산출(§11). */
export function buildManifest(
  episodeId: string,
  entries: CacheEntry[],
  budget: number = EPISODE_BYTE_BUDGET,
): CacheManifest {
  const seen = new Map<string, CacheEntry>();
  for (const e of entries) if (!seen.has(e.hash)) seen.set(e.hash, e);
  const deduped = [...seen.values()];
  const totalBytes = deduped.reduce((sum, e) => sum + e.bytes, 0);
  return { episodeId, entries: deduped, totalBytes, withinBudget: totalBytes <= budget };
}
