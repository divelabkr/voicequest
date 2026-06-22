# apps/mobile — VoiceQuest (Expo/React Native) 스캐폴드

표현 계층(dumb). 로직은 `engine`/`services`에. 입력은 마이크가 유일(음성 게이트).
※ 실제 RN/Expo 셋업은 폰/시뮬레이터가 필요해 이 세션에선 스캐폴드 설계만.

## 화면 흐름
`Title → Select(목적 카드) → Talk(대화) → Result(별+인사이트)`

## Talk 화면 (핵심)
- 진입: **배경 브리핑 카드 → "들어가기" 버튼** (목업: `voicequest_scene_entry_flow`)
- 마이크 버튼이 유일 입력 → 녹음 → `services/api` `runTurn(deps, state, audio)` 호출
- 응답: NPC 말풍선 + 자막(한글 ON/OFF 기본 ON) + 등급 연출(★·호감도) — **"처벌 아닌 성장"**
- recovery: 선창→후창 가이드(`engine` `recoveryGuide`)
- 레이턴시 흡수: 침묵 감지·추임새·끄덕임 연출

## Result 화면
- 별점 + **stats6 6각형**(`engine` `buildReadModel`) + `weaknessTags` 인사이트(발음 효능감)
- 호감도·엔딩 표시

## 셋업 (TODO)
```sh
pnpm create expo-app apps/mobile
# engine/api workspace 의존 연결
# 녹음(expo-av) → runTurn → 음성 재생
```

## 런타임 어댑터 연결 (포트 → 구현)
| 포트 | 구현(키 필요) |
|---|---|
| `SttPort` | adapters/stt-deepgram |
| `LlmPort` | llm-claude-haiku · llm-qwen (판정 모델 스파이크 결과로 확정) |
| `TtsPort` | adapters/tts-* (MiniMax 등, 빌드타임 캐시) |
| `EventStorePort` | adapters/store-firestore |
