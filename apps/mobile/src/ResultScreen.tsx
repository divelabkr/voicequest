// 결과 화면 — 에피소드 클리어 후 별·6역량 레이더·호감도·인사이트(데이터 시각화 집약).
// 데이터는 props(서버 readModel에서 주입). 미연결 시 샘플로 렌더.
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import RadarChart from "./components/RadarChart";
import { T } from "./theme";

export default function ResultScreen({
  stats = [70, 80, 60, 85, 65, 90],
  affinity = 8,
  affinityMax = 10,
  stars = 3,
  insight = "자연스러운 표현이 부쩍 늘었어요. 다음엔 정중한 말끝(です·ます)을 연습해볼까요?",
  onReview,
  onNext,
}: {
  stats?: number[];
  affinity?: number;
  affinityMax?: number;
  stars?: number;
  insight?: string;
  onReview?: () => void;
  onNext?: () => void;
}) {
  const pct = affinityMax > 0 ? (affinity / affinityMax) * 100 : 0;
  return (
    <ScrollView style={st.root} contentContainerStyle={{ padding: 20, paddingTop: 56, maxWidth: 520, width: "100%", alignSelf: "center" }}>
      <Text style={st.kicker}>에피소드 클리어</Text>
      <Text style={st.title}>다이키 · 라멘집</Text>
      <Text style={st.stars}>
        <Text style={st.starOn}>{"★".repeat(stars)}</Text>
        <Text style={st.starOff}>{"☆".repeat(Math.max(0, 3 - stars))}</Text>
      </Text>

      <View style={st.card}>
        <Text style={st.cardLabel}>오늘의 6역량</Text>
        <RadarChart values={stats} />
      </View>

      <View style={st.card}>
        <View style={st.affRow}>
          <Text style={st.affName}>♥ 다이키 호감도</Text>
          <Text style={st.affNum}>
            {affinity} / {affinityMax}
          </Text>
        </View>
        <View style={st.gaugeBg}>
          <View style={[st.gaugeFill, { width: `${pct}%` }]} />
        </View>
      </View>

      <View style={st.insight}>
        <Text style={st.insightText}>💡 {insight}</Text>
      </View>

      <View style={st.btnRow}>
        <Pressable style={[st.btn, st.btnGhost]} onPress={onReview}>
          <Text style={st.btnGhostText}>복습하기</Text>
        </Pressable>
        <Pressable style={[st.btn, st.btnPrimary]} onPress={onNext}>
          <Text style={st.btnPrimaryText}>다음 이야기 →</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.paper },
  kicker: { fontSize: 13, color: T.hint, textAlign: "center" },
  title: { fontSize: 20, fontWeight: "500", color: T.ink, textAlign: "center", marginTop: 2 },
  stars: { fontSize: 22, textAlign: "center", marginTop: 6, letterSpacing: 3 },
  starOn: { color: T.accent },
  starOff: { color: T.line },
  card: { backgroundColor: T.card, borderWidth: 0.5, borderColor: T.line, borderRadius: T.radiusMd, padding: 14, marginTop: 14 },
  cardLabel: { fontSize: 13, fontWeight: "500", color: T.muted, marginBottom: 4 },
  affRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  affName: { fontSize: 15, color: T.ink },
  affNum: { fontSize: 14, color: T.accent, fontWeight: "500" },
  gaugeBg: { height: 10, backgroundColor: T.accentSoft, borderRadius: 6, overflow: "hidden" },
  gaugeFill: { height: "100%", backgroundColor: T.accent, borderRadius: 6 },
  insight: { backgroundColor: T.successBg, borderWidth: 0.5, borderColor: T.line, borderRadius: T.radiusMd, padding: 14, marginTop: 14 },
  insightText: { fontSize: 15, color: T.success, lineHeight: 22 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  btn: { padding: 14, borderRadius: T.radiusMd, alignItems: "center" },
  btnGhost: { flex: 1, backgroundColor: T.card, borderWidth: 0.5, borderColor: T.line },
  btnGhostText: { fontSize: 15, color: T.ink },
  btnPrimary: { flex: 1.4, backgroundColor: T.primary },
  btnPrimaryText: { fontSize: 15, color: T.primaryInk, fontWeight: "500" },
});
