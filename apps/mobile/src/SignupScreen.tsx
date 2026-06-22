// 가입 — 초대 코드(운영자 발급) + 국외이전·데이터 동의(§9) → redeem → 활성화.
// 알파 비공개 게이트: 초대 코드 없이는 입장 불가. 정식=소셜 로그인으로 AuthPort 교체.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Switch, TextInput, ActivityIndicator } from "react-native";
import { redeem } from "./api";

function inviteMsg(error: string): string {
  if (error === "invite_not_found") return "유효하지 않은 초대 코드예요.";
  if (error === "invite_already_redeemed") return "이미 사용된 초대 코드예요.";
  if (error === "invite_revoked") return "만료된 초대 코드예요.";
  return "초대 코드를 확인해 주세요.";
}

export default function SignupScreen({ onSignedUp }: { onSignedUp: (userId: string) => void }) {
  const [code, setCode] = useState("");
  const [overseas, setOverseas] = useState(false);
  const [data, setData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = code.trim().length > 0 && overseas && data;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setErr("");
    const userId = `user_${Date.now()}`;
    try {
      const res = await redeem(code.trim().toUpperCase(), userId, {
        overseasTransfer: overseas,
        dataProcessing: data,
      });
      if (res.status === "active") onSignedUp(userId);
      else if (res.error?.startsWith("invite_")) setErr(inviteMsg(res.error));
      else setErr(res.status === "waitlisted" ? "정원이 찼어요(대기 등록됨)" : "동의가 필요합니다");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={st.root}>
      <View style={st.container}>
        <Text style={st.title}>VoiceQuest</Text>
        <Text style={st.sub}>음성으로 일본어 대화 — 초대 코드로 시작해요.</Text>

        <Text style={st.fieldLabel}>초대 코드</Text>
        <TextInput
          style={st.input}
          value={code}
          onChangeText={setCode}
          placeholder="VQ-XXXX-XXXX"
          placeholderTextColor="#b4b2a9"
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <View style={st.row}>
          <Switch value={overseas} onValueChange={setOverseas} />
          <Text style={st.label}>음성 처리를 위한 국외 이전(STT/TTS)에 동의</Text>
        </View>
        <View style={st.row}>
          <Switch value={data} onValueChange={setData} />
          <Text style={st.label}>개인정보 처리에 동의</Text>
        </View>
        {err ? <Text style={st.err}>{err}</Text> : null}
        <Pressable style={[st.btn, !ready && st.btnOff]} onPress={submit} disabled={!ready || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>시작하기</Text>}
        </Pressable>
        <Text style={st.note}>탈퇴 시 모든 대화 기록이 삭제됩니다(잊혀질 권리).</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#faf7f2", padding: 24, justifyContent: "center", alignItems: "center" },
  container: { width: "100%", maxWidth: 440 },
  title: { fontSize: 28, fontWeight: "500", color: "#2c2c2a", marginBottom: 6 },
  sub: { fontSize: 15, color: "#5f5e5a", marginBottom: 28 },
  fieldLabel: { fontSize: 13, color: "#5f5e5a", marginBottom: 6 },
  input: { borderWidth: 0.5, borderColor: "#cabfa9", borderRadius: 12, padding: 14, fontSize: 17, color: "#2c2c2a", backgroundColor: "#fff", marginBottom: 24, letterSpacing: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  label: { flex: 1, fontSize: 15, color: "#2c2c2a" },
  err: { color: "#a32d2d", fontSize: 14, marginBottom: 8 },
  btn: { marginTop: 16, padding: 16, borderRadius: 14, backgroundColor: "#185fa5", alignItems: "center" },
  btnOff: { backgroundColor: "#b4b2a9" },
  btnText: { fontSize: 16, fontWeight: "500", color: "#fff" },
  note: { marginTop: 20, fontSize: 12, color: "#888780", textAlign: "center" },
});
