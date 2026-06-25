// 오디오 변환 백엔드 추상화 — afconvert(macOS Core Audio 전용)를 helper 뒤로(C-1 레드팀).
// darwin=afconvert / linux+ffmpeg=ffmpeg / 둘 다 없으면 명시적 throw(silent fail 차단=H-1).
// 빌드타임 전용(cache-build·music-collage). 산출 .m4a는 git baked-in이라 런타임 서빙은 변환 불요.
import { execFileSync } from "node:child_process";

export type AudioBackend = "afconvert" | "ffmpeg" | "none";

let _cached: AudioBackend | undefined;
export function audioBackend(): AudioBackend {
  if (_cached) return _cached;
  if (process.platform === "darwin") { _cached = "afconvert"; return _cached; }
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); _cached = "ffmpeg"; }
  catch { _cached = "none"; }
  return _cached;
}

const NO_BACKEND = "no_audio_backend: afconvert(macOS) 없고 ffmpeg(linux)도 없음 — 음성/음악 빌드 불가. Dockerfile에 ffmpeg 추가하거나 macOS 빌드타임에서 실행(산출물은 git baked-in이라 런타임 서빙은 OK).";

/** wav → m4a(AAC 32kbps). cache-build NPC 음성·music-collage BGM 인코딩. */
export function encodeM4a(wav: string, m4a: string): void {
  const b = audioBackend();
  if (b === "afconvert") execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", wav, m4a]);
  else if (b === "ffmpeg") execFileSync("ffmpeg", ["-y", "-i", wav, "-c:a", "aac", "-b:a", "32k", m4a], { stdio: "ignore" });
  else throw new Error(NO_BACKEND);
}

/** m4a → wav(LEI16 mono, sr Hz). music-collage가 캐시 음성 PCM 디코딩. */
export function decodeWav(m4a: string, wav: string, sr = 24000): void {
  const b = audioBackend();
  if (b === "afconvert") execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${sr}`, m4a, wav]);
  else if (b === "ffmpeg") execFileSync("ffmpeg", ["-y", "-i", m4a, "-ar", String(sr), "-ac", "1", "-f", "wav", "-acodec", "pcm_s16le", wav], { stdio: "ignore" });
  else throw new Error(NO_BACKEND);
}
