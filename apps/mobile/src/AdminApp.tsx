// 운영자 전용 앱 — admin 웹 콘솔을 WebView로 래핑(네이티브 재구현 대신 검증된 admin UI 재사용).
// URL은 env로 개발/배포 분리: 개발=localhost:8096(에뮬·실기기 모두 adb reverse tcp:8096), 배포=실제 admin 호스트.
import { WebView } from "react-native-webview";
import { SafeAreaView, StatusBar, View, Text } from "react-native";
import { T } from "./theme";

const ADMIN_URL = process.env.EXPO_PUBLIC_ADMIN_URL ?? "http://localhost:8096";

export default function AdminApp() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.paper }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingVertical: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: T.card }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: T.ink }}>VoiceQuest 운영 콘솔</Text>
      </View>
      <WebView
        source={{ uri: ADMIN_URL }}
        style={{ flex: 1 }}
        startInLoadingState
        renderError={() => (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: T.paper }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: T.error, backgroundColor: T.errorBg, borderRadius: T.radiusFull, paddingVertical: 4, paddingHorizontal: 10 }}>콘솔 연결 실패</Text>
            <Text style={{ fontSize: 13, color: T.muted, marginTop: 6, textAlign: "center" }}>admin 서버({ADMIN_URL})에 닿지 못했습니다.{"\n"}서버·네트워크를 확인하세요.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
