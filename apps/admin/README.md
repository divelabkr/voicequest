# apps/admin — VoiceQuest 운영 콘솔 (계획)

> 단계적 배포(alpha 25 → pilot 300 → ga)를 운영하는 내부 어드민. **두뇌는 이미 `packages/engine/src/access.ts`(순수 정책) + `AdminPort`(계약)에 있다.** 이 앱은 그걸 조작하는 표면일 뿐.

## 왜 웹인가 (모바일 아님)

어드민은 **내부 전용**이라 노출/배포 마찰이 무의미하다 → 웹 대시보드가 정답. 인증만 강하게(운영자 한정). 게임 본앱(Expo)과 별개 코드베이스.

## 제어 대상 (사용자 요구: 인원·API·회원)

| 영역 | 무엇을 | 엔진 근거 |
|---|---|---|
| **배포 단계** | alpha↔pilot↔ga 전환 (게이트 메트릭 충족 시) | `STAGE_LIMITS`·`AdminPort.setStage` |
| **인원** | 활성/웨이팅/차단 카운트, 웨이팅 승급 | `admit`·`openSlots`·`promoteWaitlist` |
| **API 사용량** | 오늘 총 턴 수, 유저별 캡 초과 모니터 | `canSpendTurn`·`dailyTurnCap` |
| **회원** | 상태 변경(차단·복구), 유료 전환 현황 | `AdminPort.setMemberStatus`·`paidCount` |

## 운영 카테고리 — 6분야 (`src/ops-categories.ts`)

ops 콘솔이 렌더하는 6개 카테고리(`OPS_CATEGORIES` + `opsProgress()`). ✓=코드 구현 · −=계획.

| 카테고리 | 핵심 항목 |
|---|---|
| **기능** | ✓발화트리·판정·사다리 ✓복습·안전NPC·콜백 ✓계측신호 −콘텐츠공장 |
| **회원** | ✓가입·동의·탈퇴 ✓인원게이트·웨이팅 −유료전환·Auth |
| **관리** | ✓캐시빌드·매니페스트 −대사검수·변주풀·어드민UI |
| **운영** | ✓배포단계·계측D1·비용 ✓API사용량·턴캡 −게이트자동화 |
| **보안** | ✓동의게이트·잊혀질권리·턴캡 −키관리·SynthID |
| **서버** | ✓STT어댑터·HTTP·폴백 −CloudRun·Firestore·§11 |

화면은 이 데이터를 import해 카드/탭으로 렌더(위젯 미리보기와 동일 구조).

## 화면 (MVP)

1. **대시보드** — `AdminSnapshot` 한 장: 단계·활성/상한·웨이팅·오늘 턴 수·유료 수
2. **인원 관리** — 웨이팅리스트 → 빈 자리만큼 승급 버튼
3. **회원** — 검색·차단·복구
4. **단계 전환** — 현재 단계 + 게이트 메트릭(전환율·리텐션) 확인 후 다음 단계

## 기술 (착수 시)

- 웹: Next.js 또는 Vite + React (어드민은 SEO 무관, 빠른 내부툴)
- 백엔드: `services/api` 재사용 + `AdminPort` 구현(Firestore 어댑터)
- 인증: 운영자 전용(Firebase Auth + 화이트리스트)

## 의존 게이트

`AdminPort` 구현체(`adapters/store-firestore`)가 **Firebase 키**를 요구한다. 그 전까지 이 앱은 계획만 — 정책 엔진(`access.ts`)은 키 0으로 이미 동작·테스트됨.
