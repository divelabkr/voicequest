// e2e 데모 — 로컬 Qwen으로 ep_01 다이키 식당을 끝까지 완주.
// mock STT(발화 시퀀스) + 진짜 Qwen 판정(Ollama) + mock TTS + memory store.
// 실행: pnpm --filter @voicequest/spike demo
import { runTurn } from "@voicequest/api";
import { initState, parseEpisode, buildReadModel, recommendLevel } from "@voicequest/engine";
import type { SttPort, TtsPort, EventStorePort, GameEvent, GameState } from "@voicequest/engine";
import { QwenLlm } from "@voicequest/llm-qwen";
import ep01raw from "../content/episodes/ep_01_daiki_diner.json";

const episode = parseEpisode(ep01raw);

// 발화 시퀀스 (mock STT) — 각 씬 정답
const utterances = [
  "一人です",
  "ラーメンをください",
  "おすすめは何ですか",
  "おいしいです",
  "お会計、お願いします",
  "ごちそうさまでした",
  "私は韓国から来ました。日本のラーメンが大好きで、特にこのお店は最高です。また絶対に来ます。", // s7 OPIc 챌린지(긴 발화)
];

let idx = 0;
const stt: SttPort = {
  async transcribe() {
    return { text: utterances[idx] ?? "", confidence: 0.92 };
  },
};
const tts: TtsPort = { async synth() { return "mock://audio.mp3"; } };

const events: GameEvent[] = [];
const store: EventStorePort = {
  async append(e) { events.push(e); },
  async readModel() { return buildReadModel(events); },
};

// 진짜 판정 = 로컬 Qwen(Ollama). 키 0·비용 0.
const llm = new QwenLlm({
  baseURL: "http://localhost:11434/v1",
  model: "qwen3-coder:30b",
  apiKey: "ollama",
});

async function play(): Promise<void> {
  console.log(`🍜 ${episode.title} — 로컬 Qwen 완주 데모 (발화 트리)\n`);
  let state: GameState = initState(episode);
  let ts = 0;
  let guard = 0;
  while (!state.done && guard++ < 30) {
    const before = state.currentSceneId;
    const said = utterances[idx] ?? "(무응답)";
    const { result, state: next } = await runTurn(
      { stt, llm, tts, store, episode },
      state,
      new ArrayBuffer(0),
      ts++,
    );

    if (!result.awaitsUser) {
      // NPC 능동 발화 — 다이키가 먼저 말 걸고, 유저 입력을 듣지 않고 밀어붙인다
      console.log(`🗣  다이키: ${result.npcLine}   ⟨유저 입력 안 받음⟩`);
    } else {
      // 음성 게이트 열림 — 유저가 말하고 judge
      const moved = result.nextSceneId !== before || result.done;
      console.log(
        `🎤 "${said}" → [${result.grade}] ${moved ? "▶" : "↻"} ${result.npcLine} (호감도 ${result.affinity})`,
      );
      if (moved) idx++;
    }
    state = next;
  }
  console.log(`\n🏁 엔딩: ${state.ending} · 턴 ${state.turnCount}`);
  const rm = buildReadModel(events);
  console.log(`📊 stats6:`, rm.stats6);
  console.log(`💛 호감도:`, rm.affinity);

  // 시험 역량(배경 가정 — "놀다 보니 시험 대비됨") + 다음 도전 레벨
  const er = rm.examReadiness;
  console.log(`\n🎓 시험 역량(숨은 의도 · 배경 가정)`);
  console.log(`   JLPT 추정: ${er.jlpt.estimated}  레벨별:`, er.jlpt.byLevel);
  console.log(`   OPIc 추정: ${er.opic.estimated} (챌린지 최고 등급 ${er.opic.best})`);
  const history = events.flatMap((e) =>
    e.type === "turn_spoken" && e.level ? [{ level: e.level, grade: e.grade }] : [],
  );
  console.log(`🪜 다음 도전 권장 레벨: ${recommendLevel(history)}`);
}

play().catch((e) => {
  console.error(e);
  process.exit(1);
});
