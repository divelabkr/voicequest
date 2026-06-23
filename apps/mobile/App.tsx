import { useState, useEffect } from "react";
import { View, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import TalkScreen from "./src/TalkScreen";
import SignupScreen from "./src/SignupScreen";
import ResultScreen from "./src/ResultScreen";
import AdminApp from "./src/AdminApp";
import { reportError, checkVersion, APP_VERSION } from "./src/api";

// 플레이버 — admin 빌드면 운영자 콘솔, 아니면 사용자 게임(app.config.js extra.flavor).
const FLAVOR = (Constants.expoConfig?.extra as { flavor?: string } | undefined)?.flavor ?? "user";

// 전역 JS 에러 자동 관측 — 캡처·기록 후 RN 기본 핸들러를 그대로 호출(복구·억제 안 함, 추적용).
const _eu = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: Error, fatal?: boolean) => void; setGlobalHandler?: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
const _prev = _eu?.getGlobalHandler?.();
_eu?.setGlobalHandler?.((e: Error, isFatal?: boolean) => {
  reportError("client_js", `${isFatal ? "fatal: " : ""}${e?.message ?? String(e)}`, "mobile");
  _prev?.(e, isFatal); // RN 기본 동작 유지 — 관측만, 복구 안 함
});

export default function App() {
  if (FLAVOR === "admin") return <AdminApp />; // 운영자 앱(WebView 콘솔)
  const [userId, setUserId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [gateMin, setGateMin] = useState<string | null>(null);
  useEffect(() => { void checkVersion().then(setGateMin); }, []); // 시작 버전 게이트(kill switch)
  if (gateMin) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#faf7f2" }}>
        <Text style={{ fontSize: 40 }}>🔄</Text>
        <Text style={{ fontSize: 20, fontWeight: "700", marginTop: 14 }}>업데이트가 필요해요</Text>
        <Text style={{ fontSize: 14, color: "#777", marginTop: 6, textAlign: "center" }}>최신 버전(v{gateMin})으로 업데이트해 주세요.{"\n"}현재 v{APP_VERSION}은 더 이상 지원되지 않습니다.</Text>
      </View>
    );
  }
  return (
    <>
      <StatusBar style="dark" />
      {!userId ? (
        <SignupScreen onSignedUp={setUserId} />
      ) : done ? (
        <ResultScreen onReview={() => setDone(false)} onNext={() => setDone(false)} />
      ) : (
        <TalkScreen
          userId={userId}
          onWithdraw={() => {
            setUserId(null);
            setDone(false);
          }}
          onDone={() => setDone(true)}
        />
      )}
    </>
  );
}
