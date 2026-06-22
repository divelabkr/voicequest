import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import TalkScreen from "./src/TalkScreen";
import SignupScreen from "./src/SignupScreen";
import ResultScreen from "./src/ResultScreen";

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
