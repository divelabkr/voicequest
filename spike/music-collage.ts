// 캐시 음성 재활용 콜라주 — MusicPort 구현(어댑터). 빌드타임(afconvert macOS), 산출 .m4a는 git/배포.
// pad=피치↓ 패드 / rhythm=박자 루프 / accent=악센트 + 에코·페이드. 신규 TTS 0(§3·§11 BGM 자리).
// production 승격 시 packages/adapters/music-collage로 이동(현재 spike — cache-build가 import).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { MusicPort, MusicSpec, AudioAsset } from "@voicequest/engine";
import { decodeWav, encodeM4a } from "./audio-convert";

const SR = 24000;
const sec = (x: number): number => Math.floor(x * SR);
const clamp = (v: number): number => (v < -32768 ? -32768 : v > 32767 ? 32767 : v);

// m4a(aac) → PCM number[] — afconvert 역변환 후 wav 'data' 청크 파싱(헤더 가변 대비 청크 순회).
function m4aToPcm(m4a: string, tmpWav: string): number[] {
  decodeWav(m4a, tmpWav, SR);
  const buf = readFileSync(tmpWav);
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === "data") {
      const end = Math.min(off + 8 + sz, buf.length - 1);
      const pcm: number[] = [];
      for (let i = off + 8; i < end; i += 2) pcm.push(buf.readInt16LE(i));
      return pcm;
    }
    off += 8 + sz + (sz & 1); // 레드팀 M-2: WAV 청크 홀수 길이 시 1바이트 패딩 정렬
  }
  return [];
}

function pitchDown(src: number[], factor: number): number[] { // factor>1 = 느리게 = 피치↓
  const out: number[] = [];
  for (let i = 0; i < Math.floor(src.length * factor); i++) out.push(src[Math.floor(i / factor)] ?? 0);
  return out;
}

function wavHeader(dataLen: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + dataLen, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(dataLen, 40); return h;
}

export function makeCollageMusic(opts: { audioDir: string; outDir: string; tmpDir: string }): MusicPort {
  return {
    async gen(spec: MusicSpec): Promise<AudioAsset> {
      mkdirSync(opts.outDir, { recursive: true });
      mkdirSync(opts.tmpDir, { recursive: true });
      const sources = spec.sources ?? [];
      const load = (h: string): number[] => m4aToPcm(`${opts.audioDir}/${h}.m4a`, `${opts.tmpDir}/${h}.wav`);

      const total = sec(spec.durationSec);
      const mix = new Array<number>(total).fill(0);
      const add = (src: number[], at: number, gain: number): void => {
        for (let i = 0; i < src.length; i++) { const j = at + i; if (j >= total) break; mix[j] = clamp(mix[j]! + Math.round(src[i]! * gain)); }
      };

      // pad: 피치↓ 1.5x, 시작·중반 2회 레이어
      for (const s of sources.filter((x) => x.role === "pad")) {
        const pad = pitchDown(load(s.hash), 1.5);
        add(pad, sec(0.5), 0.5); add(pad, sec(spec.durationSec / 2), 0.42);
      }
      // rhythm: 0.65s 박자로 순환
      const rhythms = sources.filter((x) => x.role === "rhythm").map((s) => load(s.hash));
      if (rhythms.length) { let t = 1.0, i = 0; while (t < spec.durationSec - 1) { add(rhythms[i % rhythms.length]!, sec(t), 0.55); t += 0.65; i++; } }
      // accent: 중반
      for (const s of sources.filter((x) => x.role === "accent")) add(load(s.hash), sec(spec.durationSec / 2 - 0.1), 0.6);

      // 에코(딜레이 0.18s·감쇠 0.35) + 페이드 인/아웃 1.2s
      const d = sec(0.18);
      for (let i = d; i < total; i++) mix[i] = clamp(mix[i]! + Math.round(mix[i - d]! * 0.35));
      const f = sec(1.2);
      for (let i = 0; i < f; i++) { const g = i / f; mix[i] = Math.round(mix[i]! * g); mix[total - 1 - i] = Math.round(mix[total - 1 - i]! * g); }

      const pcm = Buffer.alloc(total * 2);
      for (let i = 0; i < total; i++) pcm.writeInt16LE(mix[i]!, i * 2);
      writeFileSync(`${opts.tmpDir}/music.wav`, Buffer.concat([wavHeader(pcm.length), pcm]));
      const out = `${opts.outDir}/${spec.kind}.m4a`;
      encodeM4a(`${opts.tmpDir}/music.wav`, out);
      return { url: out, bytes: readFileSync(out).length, format: "m4a", synthId: true };
    },
  };
}
