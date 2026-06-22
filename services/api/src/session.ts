// 턴 루프 오케스트레이션 (CLAUDE.md §5) + 발화 트리.
// beat가 npc/npc_push/npc_silent면 유저 발화를 무시하고 NPC가 능동 진행(awaitsUser=false).
// user beat에서만 STT→judge→advance(음성 게이트).
import { judge, advance, findScene, deflectionTone, affinityPenalty, adjustStrictness } from "@voicequest/engine";
import type {
  Episode,
  GameState,
  Grade,
  JudgeResult,
  DialogueBeat,
  BeatCondition,
  LlmPort,
  SttPort,
  TtsPort,
  EventStorePort,
  Transcript,
} from "@voicequest/engine";

export interface TurnDeps {
  stt: SttPort;
  llm: LlmPort;
  tts: TtsPort;
  store: EventStorePort;
  episode: Episode;
}

export interface TurnResult {
  npcLine: string;
  audioUrl: string;
  grade: string; // S|A|B|C, npc beat은 "-"
  affinity: number;
  nextSceneId: string;
  done: boolean;
  awaitsUser: boolean; // false=NPC 능동(유저 무시), true=유저 판정
  speaker?: string; // 발화 NPC id(다중 NPC 챕터 — 없으면 메인 character)
  speakerName?: string; // 화자 표시명
  speakerIsMain?: boolean; // 메인 캐릭터 여부(서브 NPC만 라벨 표시)
}

const USER_BEAT: DialogueBeat = { kind: "user" };

export async function runTurn(
  deps: TurnDeps,
  state: GameState,
  audio: ArrayBuffer,
  ts: number,
  recentGrades: Grade[] = [],
): Promise<{ result: TurnResult; state: GameState }> {
  const scene = findScene(deps.episode, state.currentSceneId);
  if (!scene) throw new Error(`scene_not_found: ${state.currentSceneId}`);

  const beats = scene.beats && scene.beats.length > 0 ? scene.beats : [USER_BEAT];
  const beat = beats[state.beatIndex] ?? USER_BEAT;

  // ── NPC 능동 / 끼어듦 무시 / 무반응 — 유저 발화를 judge하지 않고 자동 진행 ──
  if (beat.kind !== "user") {
    // 동적 등장 — 조건(호감도·직전 등급) 미충족이면 이 beat 건너뛰고 다음으로(재귀)
    const cond = (beat.kind === "npc" || beat.kind === "npc_push") ? beat.condition : undefined;
    if (cond && !meetsCondition(cond, state.affinity, recentGrades)) {
      return runTurn(deps, { ...state, beatIndex: state.beatIndex + 1 }, audio, ts, recentGrades);
    }
    const npcLine = beat.kind === "npc_silent" ? "（…沈黙…）" : beat.line;
    // 다중 NPC — beat.speaker(npc id)로 화자 결정. 없으면 메인 character. voice도 화자 기준.
    const speaker = (beat.kind === "npc" || beat.kind === "npc_push") ? (beat.speaker ?? deps.episode.character) : deps.episode.character;
    const speakerNpc = deps.episode.npcs?.find((n) => n.id === speaker);
    const audioUrl = await safeSynth(deps.tts, npcLine, speaker);
    return {
      result: {
        npcLine,
        audioUrl,
        speaker,
        speakerName: speakerNpc?.name,
        speakerIsMain: speaker === deps.episode.character,
        grade: "-",
        affinity: state.affinity,
        nextSceneId: state.currentSceneId,
        done: false,
        awaitsUser: false,
      },
      state: { ...state, beatIndex: state.beatIndex + 1 },
    };
  }

  // ── user beat — 음성 게이트 ──
  // 오디오가 없으면(발화트리 폴링·입장 직후) 판정하지 않고 "당신 차례"만 알린다(상태 유지).
  if (audio.byteLength === 0) {
    return {
      result: {
        npcLine: "（どうぞ、お話しください）",
        audioUrl: "",
        grade: "-",
        affinity: state.affinity,
        nextSceneId: state.currentSceneId,
        done: false,
        awaitsUser: true,
      },
      state,
    };
  }
  // 오디오 있음 → STT(폴백: 못 알아들으면 recovery 안내) → judge → advance
  let tr: Transcript;
  try {
    tr = await deps.stt.transcribe(audio, "ja");
  } catch {
    const fb = await safeSynth(deps.tts, "ごめん、もう一度どうぞ", deps.episode.character);
    return {
      result: { npcLine: "ごめん、もう一度どうぞ", audioUrl: fb, grade: "-", affinity: state.affinity, nextSceneId: state.currentSceneId, done: false, awaitsUser: true },
      state,
    };
  }
  const jr: JudgeResult = await judge(
    {
      transcript: tr.text,
      sttConfidence: tr.confidence,
      scene,
      modifier: {},
      strictness: adjustStrictness(recentGrades, scene.level),
      affinity: state.affinity,
    },
    deps.llm,
  );

  // ── 안전 분기: 못된 말(inappropriate)·위험(harmful)은 흡수 — advance X, 호감도 냉각, deflection 응답(규칙5) ──
  if (jr.category === "inappropriate" || jr.category === "harmful") {
    const affinity = state.affinity + affinityPenalty(jr.category);
    const npcLine = deflectionLine(deflectionTone(jr.category, 0));
    const deflAudio = await safeSynth(deps.tts,npcLine, deps.episode.character);
    await deps.store.append({
      type: "turn_spoken",
      sceneId: scene.id,
      transcript: tr.text,
      grade: jr.grade,
      weakness: jr.weaknessTags,
      level: scene.level,
      ts,
    });
    return {
      result: { npcLine, audioUrl: deflAudio, grade: jr.grade, affinity, nextSceneId: state.currentSceneId, done: false, awaitsUser: true },
      state: { ...state, affinity },
    };
  }

  const adv = advance(state, jr, deps.episode, ts);
  // 직전 발화에 대한 ack 반응 — 다음 씬의 실제 선창은 beats 폴링이 잇는다(placeholder 노출 제거).
  const npcLine =
    jr.nextSceneId === "recovery" ? "もう一度どうぞ"
      : adv.state.done ? "また来てね！またいつでもおいで" : ackLine(jr.grade);
  const audioUrl = await safeSynth(deps.tts,npcLine, deps.episode.character);
  await deps.store.append({
    type: "turn_spoken",
    sceneId: scene.id,
    transcript: tr.text,
    grade: jr.grade,
    weakness: jr.weaknessTags,
    level: scene.level,
    ts,
  });
  for (const ev of adv.events) await deps.store.append(ev);
  return {
    result: {
      npcLine,
      audioUrl,
      grade: jr.grade,
      affinity: adv.state.affinity,
      nextSceneId: adv.state.currentSceneId,
      done: adv.state.done,
      awaitsUser: true,
    },
    state: adv.state,
  };
}

// 동적 등장 조건 평가 — 호감도·직전 등급 충족 여부(예: 호감도 2면 단골손님 등장).
function meetsCondition(c: BeatCondition, affinity: number, recentGrades: Grade[]): boolean {
  if (c.minAffinity != null && affinity < c.minAffinity) return false;
  if (c.minGrade != null) {
    const gv = (g: Grade): number => (g === "S" ? 3 : g === "A" ? 2 : g === "B" ? 1 : 0);
    const last = recentGrades[recentGrades.length - 1];
    if (!last || gv(last) < gv(c.minGrade)) return false;
  }
  return true;
}

// TTS 폴백 — 실패 시 자막만(audioUrl 빈)으로 흡수. 외부 호출 try/catch(§9).
async function safeSynth(tts: TtsPort, text: string, voice: string): Promise<string> {
  try {
    return await tts.synth(text, voice);
  } catch {
    return "";
  }
}

// deflection 대사(placeholder) — 콘텐츠 공장 캐시 연동 전 임시. 캐릭터별 변주는 §11 캐시.
function deflectionLine(tone: "gentle" | "firm" | "cold"): string {
  switch (tone) {
    case "cold":
      return "（…その話はやめておこうか）";
    case "firm":
      return "（さあ、話を戻そう）";
    default:
      return "（はは、面白いこと言うね。それより）";
  }
}

// 직전 발화에 대한 다이키의 짧은 반응(grade 기반). 다음 씬 선창은 beats 폴링이 잇는다.
function ackLine(grade: string): string {
  if (grade === "S" || grade === "A") return "おっ、いいね！";
  if (grade === "B") return "はいよ、了解！";
  return "うん、なるほどね";
}
