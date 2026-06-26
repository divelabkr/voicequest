#!/bin/bash
# VoiceQuest standalone 2앱 빌드 — 사용자(user) + 운영자(admin).
# release 빌드: JS번들 APK 내장 + Hermes + debug키 서명 → dev launcher 없이 바로 실행(Expo Go/Metro 불필요).
# 사용법: ./build-apps.sh        (둘 다)
#         ./build-apps.sh user   (하나만)
# 결과: voicequest-user.apk, voicequest-admin.apk (이 디렉토리)
set -e
cd "$(dirname "$0")"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
# 백엔드 URL — env로 덮어쓰기 가능, 없으면 cloud 기본(주입 깜빡 시 localhost 폴백 방지: 폰서 자기자신 호출 → 서버 못 찾음 버그 차단)
export EXPO_PUBLIC_API_BASE="${EXPO_PUBLIC_API_BASE:-https://voicequest-api-tgmskrfryq-du.a.run.app}"
export EXPO_PUBLIC_ADMIN_URL="${EXPO_PUBLIC_ADMIN_URL:-https://voicequest-api-tgmskrfryq-du.a.run.app/admin}"
echo "🔗 API_BASE=$EXPO_PUBLIC_API_BASE"

FLAVORS="${1:-user admin}"
for FLAVOR in $FLAVORS; do
  echo "━━━ $FLAVOR 빌드 ━━━"
  APP_FLAVOR="$FLAVOR" npx expo prebuild --platform android --clean
  (cd android && APP_FLAVOR="$FLAVOR" ./gradlew assembleRelease --no-daemon)
  cp android/app/build/outputs/apk/release/app-release.apk "./voicequest-$FLAVOR.apk"
  echo "→ voicequest-$FLAVOR.apk ($(du -h "voicequest-$FLAVOR.apk" | cut -f1))"
done
echo "✅ 완료 — adb install voicequest-<flavor>.apk 로 설치"
