import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import TalkScreen from "./src/TalkScreen";
import SignupScreen from "./src/SignupScreen";
import ResultScreen from "./src/ResultScreen";
import { reportError } from "./src/api";

// 전역 JS 에러 자동 관측 — 캡처·기록 후 RN 기본 핸들러를 그대로 호출(복구·억제 안 함, 추적용).
const _eu = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: Error, fatal?: boolean) => void; setGlobalHandler?: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
const _prev = _eu?.getGlobalHandler?.();
_eu?.setGlobalHandler?.((e: Error, isFatal?: boolean) => {
  reportError("client_js", `${isFatal ? "fatal: " : ""}${e?.message ?? String(e)}`, "mobile");
  _prev?.(e, isFatal); // RN 기본 동작 유지 — 관측만, 복구 안 함
});

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
