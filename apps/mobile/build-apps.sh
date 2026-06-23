#!/bin/bash
# VoiceQuest standalone 2앱 빌드 — 사용자(user) + 운영자(admin). Expo Go 없이 local prebuild+gradle.
# 사용법: ./build-apps.sh        (둘 다)
#         ./build-apps.sh user   (하나만)
# 결과: voicequest-user.apk, voicequest-admin.apk (이 디렉토리)
set -e
cd "$(dirname "$0")"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

FLAVORS="${1:-user admin}"
for FLAVOR in $FLAVORS; do
  echo "━━━ $FLAVOR 빌드 ━━━"
  APP_FLAVOR="$FLAVOR" npx expo prebuild --platform android --clean
  (cd android && APP_FLAVOR="$FLAVOR" ./gradlew assembleDebug --no-daemon)
  cp android/app/build/outputs/apk/debug/app-debug.apk "./voicequest-$FLAVOR.apk"
  echo "→ voicequest-$FLAVOR.apk ($(du -h "voicequest-$FLAVOR.apk" | cut -f1))"
done
echo "✅ 완료 — adb install voicequest-<flavor>.apk 로 설치"
