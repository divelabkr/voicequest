// 앱 플레이버 — APP_FLAVOR=admin이면 운영자 앱, 아니면(user) 사용자 게임 앱.
// 별도 번들 ID/이름으로 한 코드베이스에서 standalone 2앱을 빌드(Expo Go 불필요, expo prebuild + gradle).
const isAdmin = process.env.APP_FLAVOR === "admin";

module.exports = {
  expo: {
    name: isAdmin ? "VoiceQuest 운영" : "VoiceQuest",
    slug: "voicequest",
    version: "0.0.1",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: isAdmin ? "kr.divelab.voicequest.admin" : "kr.divelab.voicequest",
      infoPlist: { NSMicrophoneUsageDescription: "음성으로 NPC와 대화하기 위해 마이크를 사용합니다." },
    },
    android: {
      package: isAdmin ? "kr.divelab.voicequest.admin" : "kr.divelab.voicequest",
      // 운영자 앱은 마이크 불필요(WebView 콘솔). 사용자 앱만 RECORD_AUDIO.
      permissions: isAdmin ? [] : ["RECORD_AUDIO"],
    },
    web: { bundler: "metro" },
    plugins: ["expo-asset", "expo-font"],
    extra: { flavor: isAdmin ? "admin" : "user" },
  },
};
