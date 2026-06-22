// 캐시 빌드 잡(CLAUDE.md §5) — 에피소드 JSON → 빌드타임 이미지/음악 생성 → 매니페스트.
// 런타임은 조회만(규칙3: NPC는 캐시). 공급자는 포트 뒤(규칙7). 압축·dedup·예산은 §11.
import { assetHash, buildManifest } from "@voicequest/engine";
import type {
  Episode,
  ImagePort,
  MusicPort,
  ImageSpec,
  MusicSpec,
  VisualAsset,
  AudioAsset,
  CacheEntry,
  CacheManifest,
} from "@voicequest/engine";

export interface CacheBuildDeps {
  image: ImagePort;
  music: MusicPort;
}

// §9: AI 생성물은 SynthID 표시 필수 — 없으면 빌드 실패
function requireSynthId(key: string, asset: { synthId: boolean }): void {
  if (!asset.synthId) throw new Error(`synthid_required: ${key}`);
}

function imageEntry(key: string, spec: ImageSpec, asset: VisualAsset): CacheEntry {
  requireSynthId(key, asset);
  return {
    key,
    hash: assetHash("img:" + JSON.stringify(spec)),
    url: asset.url,
    bytes: asset.bytes,
    format: asset.format,
    kind: "image",
  };
}

function musicEntry(key: string, spec: MusicSpec, asset: AudioAsset): CacheEntry {
  requireSynthId(key, asset);
  return {
    key,
    hash: assetHash("mus:" + JSON.stringify(spec)),
    url: asset.url,
    bytes: asset.bytes,
    format: asset.format,
    kind: "music",
  };
}

/** 에피소드의 빌드타임 자산(배경·캐릭터·BGM)을 생성하고 매니페스트로 묶는다. */
export async function buildEpisodeCache(
  deps: CacheBuildDeps,
  episode: Episode,
): Promise<CacheManifest> {
  const entries: CacheEntry[] = [];

  // 배경 이미지(에피소드 무대)
  const bgSpec: ImageSpec = { prompt: `${episode.title}의 배경 무대`, kind: "background" };
  entries.push(imageEntry("bg", bgSpec, await deps.image.gen(bgSpec)));

  // 캐릭터 이미지(기본 표정)
  const charSpec: ImageSpec = { prompt: `${episode.character}의 기본 표정`, kind: "character" };
  entries.push(imageEntry(`char:${episode.character}`, charSpec, await deps.image.gen(charSpec)));

  // BGM(에피소드 1 루프)
  const bgmSpec: MusicSpec = {
    prompt: `${episode.title} 분위기 BGM`,
    durationSec: 60,
    loop: true,
    kind: "bgm",
  };
  entries.push(musicEntry("bgm", bgmSpec, await deps.music.gen(bgmSpec)));

  return buildManifest(episode.id, entries);
}
