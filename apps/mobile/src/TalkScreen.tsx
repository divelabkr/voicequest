// Talk 화면 — 마이크 입력이 유일 입력(음성 게이트). NPC 능동 beat 자동 진행 + 유저 발화 판정.
// 녹음은 플랫폼 무관 recorder(.native=expo-av / .web=MediaRecorder). 넓은 화면은 maxWidth 중앙.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { postTurn, withdraw, API_BASE, type TurnResult } from "./api";
import { createRecorder, type Recorder } from "./recorder";
import { playAudio } from "./player";
import Furigana from "./Furigana";
import { T } from "./theme";

type Line = { who: "npc" | "you"; text: string; grade?: string; furigana?: string; words?: { w: string; gloss: string }[] };

export default function TalkScreen({ userId, onWithdraw, onDone }: { userId: string; onWithdraw: () => void; onDone?: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [affinity, setAffinity] = useState(0);
  const [rec, setRec] = useState<Recorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState(false);
  const micActionRef = useRef<() => void>(() => {});

  const apply = useCallback((res: TurnResult) => {
    setAffinity(res.affinity);
    setLines((l) => [...l, { who: "npc", text: res.npcLine, furigana: res.furigana, words: res.words }]);
    if (res.audioUrl) playAudio(`${API_BASE}${res.audioUrl}`); // 캐시된 NPC 음성 재생
  }, []);

  // NPC 능동 beat 자동 진행(빈 오디오 반복 → 유저 차례까지)
  const advanceNpc = useCallback(async () => {
    setBusy(true);
    try {
      const res = await postTurn(userId, null);
      (res.queue || []).forEach(apply); // 배치 — 1요청으로 user beat까지 NPC 대사 일괄(perf #2)
      setAffinity(res.affinity);
      if (res.done) onDone?.();
    } catch (e) {
      setLines((l) => [...l, { who: "npc", text: `(오류) ${String(e)}` }]);
    }
    setBusy(false);
  }, [apply, userId, onDone]);

  const enter = useCallback(async () => { setEntered(true); await advanceNpc(); }, [advanceNpc]);

  const onMic = useCallback(async () => {
    if (busy) return;
    if (!rec) {
      const r = createRecorder();
      try { await r.start(() => micActionRef.current()); setRec(r); } // 웹 VAD 발화 끝 → 자동 전송
      catch (e) { setLines((l) => [...l, { who: "npc", text: `(마이크 오류) ${String(e)}` }]); }
      return;
    }
    setBusy(true);
    let blob: Blob | null = null;
    try { blob = await rec.stop(); } catch { /* noop */ } finally { setRec(null); }
    try {
      const res = await postTurn(userId, blob);
      setLines((l) => [...l, { who: "you", text: "(내 발화)", grade: res.grade }]);
      apply(res);
      if (!res.done) await advanceNpc(); // 다음 NPC 능동 beat
      else onDone?.(); // 클리어 → 결과 화면
    } catch (e) {
      setLines((l) => [...l, { who: "npc", text: `(오류) ${String(e)}` }]);
    }
    setBusy(false);
  }, [rec, busy, apply, advanceNpc, userId, onDone]);

  useEffect(() => { micActionRef.current = onMic; }, [onMic]);

  return (
    <View style={st.root}>
      <View style={st.container}>
        <View style={st.header}>
          <Text style={st.title}>다이키 · 라멘집</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={st.aff}>♥ {affinity}</Text>
            <Pressable onPress={async () => { try { await withdraw(userId); } finally { onWithdraw(); } }}>
              <Text style={st.withdraw}>탈퇴</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView style={st.log} contentContainerStyle={{ padding: 12 }}>
          {!entered ? (
            <View style={st.welcome}>
              <Text style={st.bowl}>🍜</Text>
              <Text style={st.welcomeSub}>다이키의 라멘집에 들어갑니다</Text>
              <Pressable style={st.enter} onPress={enter}><Text style={st.enterText}>입장하기</Text></Pressable>
            </View>
          ) : (
            lines.map((l, i) => (
              <View key={i} style={[st.bubble, l.who === "you" ? st.you : st.npc]}>
                {l.grade ? <Text style={st.grade}>[{l.grade}]</Text> : null}
                {l.furigana ? <Furigana text={l.furigana} /> : <Text style={[st.bubbleText, l.who === "you" && st.youText]}>{l.text}</Text>}
                {l.words && l.words.length ? (
                  <View style={st.words}>
                    {l.words.map((w, wi) => (
                      <Text key={wi} style={st.word}>{w.w} · {w.gloss}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
        {entered ? (
          <View style={st.micBar}>
            <Pressable style={[st.mic, busy && st.micBusy]} onPress={onMic} disabled={busy}>
              {busy ? <ActivityIndicator color={T.accentInk} /> : <Text style={st.micText}>{rec ? "■" : "🎤"}</Text>}
            </Pressable>
            <Text style={st.micHint}>{busy ? "처리 중…" : rec ? "멈추고 전송" : "눌러서 말하기"}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.paper, alignItems: "center" },
  container: { flex: 1, width: "100%", maxWidth: 600 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 56, backgroundColor: T.card, borderBottomWidth: 0.5, borderColor: T.line },
  title: { fontSize: 16, fontWeight: "500", color: T.ink },
  aff: { fontSize: 15, color: T.accent },
  withdraw: { fontSize: 13, color: T.hint },
  log: { flex: 1 },
  welcome: { alignItems: "center", marginTop: 56, gap: 14 },
  bowl: { fontSize: 76 },
  welcomeSub: { fontSize: 15, color: T.muted },
  enter: { alignSelf: "center", marginTop: 8, paddingVertical: 14, paddingHorizontal: 32, backgroundColor: T.accent, borderRadius: T.radiusMd },
  enterText: { fontSize: 16, fontWeight: "500", color: T.accentInk },
  bubble: { maxWidth: "82%", padding: 10, borderRadius: T.radiusLg, marginVertical: 5 },
  npc: { alignSelf: "flex-start", backgroundColor: T.card, borderWidth: 0.5, borderColor: T.line },
  you: { alignSelf: "flex-end", backgroundColor: T.primary },
  bubbleText: { fontSize: 16, color: T.ink },
  youText: { color: T.primaryInk },
  grade: { alignSelf: "flex-start", fontSize: 12, color: T.success, backgroundColor: T.successBg, borderRadius: T.radiusFull, paddingVertical: 2, paddingHorizontal: 8, marginBottom: 4 },
  words: { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderColor: T.line, gap: 1 },
  word: { fontSize: 12, color: T.muted },
  micBar: { alignItems: "center", paddingVertical: 16, gap: 6 },
  mic: { width: 88, height: 88, borderRadius: T.radiusFull, backgroundColor: T.accent, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: T.ink, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 } },
  micBusy: { opacity: 0.7 },
  micText: { fontSize: 30, color: T.accentInk },
  micHint: { fontSize: 13, color: T.muted },
});
