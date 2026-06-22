# VoiceQuest — 빌드 아키텍처 (CLAUDE.md 시드)

> Claude Code가 이 프로젝트를 짤 때 읽는 북극성 문서.
> 한 줄 정의: **"목적이 있는 상황에서 말해야 게임이 열린다"** — 음성 입력 일본어 학습 게임.
> 기준일 2026.06 · 단가/모델은 착수 시점 재검증.

---

## 0. 절대 규칙 (어기면 제품이 무너짐)

1. **음성 게이트**: 진행은 항상 "말하기"로만. 텍스트/각본 모드도 입력은 음성.
2. **파이프라인, 네이티브 금지**: STT → 판정 → TTS 분리. speech-to-speech 통합형 쓰지 않는다 (전사가 필요하므로).
3. **NPC는 캐시, 유저만 실시간**: TTS·이미지는 사전 생성/저장. live 비용은 STT+판정뿐.
4. **가이드 고정, 표면 변주**: 판정 골격(intent/허용표현)은 고정. NPC 대사·modifier는 변동. 완전 자유대화 금지.
5. **판단 않고 통제·기록**: 틀려도 분기로 흡수. 모든 발화는 이벤트로 append.
6. **엔진은 재사용 패키지**: 코어를 앱/콘텐츠와 분리. 같은 엔진 → 여러 제품.
7. **공급자는 어댑터 뒤에**: STT/LLM/TTS/Image는 인터페이스로 추상화. 교체 가능해야 함.

---

## 1. 아키텍처 대원칙 — "엔진 = 재사용 코어"

```
packages/engine   ← 재사용 코어 (판정·상태머신·어댑터 인터페이스)
   ▲ 의존
apps/*            ← 표현 계층 (음성게임 / 각본모드 / 추후 SpeakSuite)
content/*         ← 콘텐츠 (에피소드 JSON, 교체·UGC 확장 가능)
services/api      ← 백엔드 (오케스트레이션 + Firestore)
```

엔진은 React Native/Firestore/특정 공급자를 **모른다**. 순수 로직 + 인터페이스만. 그래야 "같은 소스, 다른 방향"이 코드로 성립한다.

---

## 2. 모노레포 구조

```
voicequest/
├─ CLAUDE.md                 # 이 문서
├─ package.json              # 워크스페이스 루트 (pnpm/turborepo)
├─ packages/
│  ├─ engine/                # ★ 재사용 코어 (프레임워크 무관)
│  │  ├─ src/
│  │  │  ├─ stateMachine.ts      # 에피소드 진행 상태머신
│  │  │  ├─ judge.ts             # 판정 엔진 (골격 기반)
│  │  │  ├─ opic.ts              # 동적 난이도 조정
│  │  │  ├─ affinity.ts          # 호감도 누적/엔딩 분기
│  │  │  ├─ recovery.ts          # 힌트→흥얼거림→선창/후창
│  │  │  ├─ types.ts             # Episode/Scene/Grade 타입
│  │  │  └─ ports/               # 어댑터 인터페이스 (포트)
│  │  │     ├─ Stt.ts            # interface SttPort
│  │  │     ├─ Llm.ts            # interface LlmPort (판정)
│  │  │     ├─ Tts.ts            # interface TtsPort
│  │  │     ├─ ImageGen.ts       # interface ImagePort
│  │  │     └─ EventStore.ts     # interface EventStorePort
│  │  └─ test/
│  ├─ adapters/              # 포트 구현체 (공급자별)
│  │  ├─ stt-deepgram/
│  │  ├─ llm-claude-haiku/
│  │  ├─ tts-elevenlabs/     # 캐시용
│  │  ├─ tts-cartesia/       # 실시간용
│  │  ├─ image-nanobanana/
│  │  └─ store-firestore/
│  └─ ui/                    # 공유 RN 컴포넌트 (대화창·마이크·자막토글)
├─ apps/
│  └─ mobile/                # React Native (Expo)
│     ├─ screens/            # Title/Select/Talk/Result
│     └─ App.tsx
├─ services/
│  └─ api/                   # Cloud Run (오케스트레이션 + 캐시 빌드)
│     ├─ src/
│     │  ├─ session.ts       # 턴 루프 오케스트레이션
│     │  ├─ cacheBuild.ts    # NPC 음성/변주풀 사전생성 잡
│     │  └─ routes/
│     └─ Dockerfile
└─ content/
   └─ episodes/
      └─ ep_01_daiki_diner.json   # 판정 골격 (기존 작성본)
```

---

## 3. 코어 엔진 — 포트(인터페이스)

```ts
// ports — 엔진은 구현이 아니라 이 계약에만 의존
interface SttPort   { transcribe(audio: AudioChunk, lang: 'ja'): Promise<Transcript> }
interface LlmPort   { judge(input: JudgeInput): Promise<JudgeResult> }   // 전사 vs 허용표현
interface TtsPort   { synth(text: string, voice: VoiceId, style?: Style): Promise<AudioUrl> }
interface ImagePort { gen(prompt: string, refs?: ImageRef[]): Promise<ImageUrl> } // 빌드타임만
interface EventStorePort {
  append(e: GameEvent): Promise<void>
  readModel(userId: string): Promise<ReadModel>
}
```

```ts
// 판정 입력/출력 — 골격이 곧 계약
type JudgeInput = {
  transcript: string
  scene: Scene            // intent, required_slots, allowed_expressions
  modifier: Modifier
  strictness: Strictness  // OPIc가 조정
  affinity: number
}
type JudgeResult = {
  grade: 'S'|'A'|'B'|'C'
  matched: string[]
  weaknessTags: WeaknessTag[]   // 발음/길이/자연도/정중함
  affinityDelta: number
  nextSceneId: string | 'recovery'
}
```

핵심: `judge()`는 자유 판단 금지. `scene.allowed_expressions` 매칭 + 골격 기준으로만 등급 산정. 미매칭 → `recovery`.

---

## 4. 어댑터 (공급자 — 교체 가능)

| 포트 | 1순위 구현 | 대안 | 비고 |
|---|---|---|---|
| SttPort | Deepgram Flux | Gemini STT | 일본어 초보 발음 테스트 |
| LlmPort | Claude Haiku급 | Gemini Flash | 판정 전용, 저렴 |
| TtsPort (캐시) | ElevenLabs v3 | Gemini Flash TTS | 빌드타임 사전생성 |
| TtsPort (실시간) | Cartesia Sonic 3.5 | — | 변주분만 |
| ImagePort | Nano Banana 2 | — | 빌드타임, SynthID 자동 |
| EventStorePort | Firestore | — | 이벤트 append |

> 어댑터는 환경변수로 주입. 엔진 코드는 절대 공급자 이름을 모름.

---

## 5. 백엔드 (services/api)

**턴 루프 오케스트레이션 (session.ts)**
```
POST /session/turn
  body: { sessionId, audio }
  ① SttPort.transcribe(audio)        → transcript
  ② engine.judge(transcript, scene)  → JudgeResult (LlmPort 주입)
  ③ engine.advance(result)           → nextScene / recovery
  ④ 캐시에서 NPC 대사+음성 조회 (사전생성 풀)
  ⑤ EventStorePort.append(turnEvent)
  ⑥ return { npcLine, audioUrl, grade, affinity, nextScene }
```

**캐시 빌드 잡 (cacheBuild.ts) — 오프라인/배포 시 1회**
```
에피소드 JSON 읽기 →
  NPC 고정대사 → TtsPort.synth → 저장
  modifier 변주풀 20~30개 → 저장
  흥얼거림/모범답안/회복힌트 음성 → 저장
  캐릭터/배경 이미지 → ImagePort.gen → 저장
→ 런타임은 조회만 (실시간 생성 X)
```

---

## 6. 데이터 모델 (Firestore — 이벤트 소싱)

```
users/{uid}
events/{uid}/{eventId}        # append-only 불변 로그
  - turn_spoken   { sceneId, transcript, grade, weakness[] }
  - scene_advance { from, to, modifier }
  - episode_clear { episodeId, stars, ending, affinity }
  - energy_spent / energy_recharged
snapshots/{uid}               # 주기 집계
readmodels/{uid}              # 화면용
  - stats6  { 발음/어휘/문법/자연도/속도/도전 }
  - affinity { daiki: n, ... }
  - progress { unlocked[], streak }
content_cache/{episodeId}     # 사전생성 음성/이미지 URL 풀
```

음성 원본: STT 후 **즉시 폐기**. 복습 녹음은 별도 동의 + 암호화 + TTL 30일.

---

## 7. 모바일 앱 (apps/mobile)

```
화면: Title → Select(목적카드) → Talk(대화) → Result(별+인사이트)
입력: 마이크 버튼이 유일 입력 (음성 게이트)
상태: 엔진 readModel 구독, 화면은 dumb (로직은 엔진/백엔드)
연출: 침묵감지·끼어들기·추임새로 레이턴시 흡수
자막: 한글 ON/OFF 토글 (기본 ON)
```

기존 프로토타입(voicequest_prototype.html)이 화면 레퍼런스.

---

## 8. 빌드 순서 (Claude Code 페이즈)

```
Phase 0 — 골격
  [ ] 모노레포 셋업 (pnpm + turborepo)
  [ ] packages/engine 타입·포트 정의
  [ ] ep_01 JSON 로더 + 상태머신 (어댑터 mock으로 단위테스트)

Phase 1 — 수직 슬라이스 (1턴이 끝까지 도는 것)
  [ ] STT 어댑터 1개 (Deepgram)
  [ ] judge() 실제 구현 + LLM 어댑터
  [ ] 캐시 TTS 1개 (ElevenLabs) + cacheBuild 잡
  [ ] /session/turn 엔드포인트
  [ ] mobile Talk 화면 → 폰에서 다이키랑 1턴 대화

Phase 2 — 에피소드 1 완주
  [ ] s1~s6 전체 + recovery 루프
  [ ] 선창→후창→독창 / 흥얼거림
  [ ] Result 화면 (별+인사이트)
  [ ] 에너지 시스템 + 이벤트 기록

Phase 3 — 검증/확장
  [ ] OPIc 동적 난이도
  [ ] 에피소드 3개 / 캐릭터 2명
  [ ] D1/D7 리텐션 계측
```

규칙: **Phase 1 수직 슬라이스(1턴 끝까지)를 가장 먼저.** 가로로 다 만들지 말고 세로로 한 줄 관통 후 확장.

---

## 9. 엔지니어링 가드레일

```
[보안/법률 — 코드에 박을 것]
- 음성 원본 즉시 폐기 (저장 금지가 기본)
- 국외이전 동의 없이 STT/TTS 호출 금지 (동의 플래그 체크)
- AI 생성물 표시 (SynthID + 화면 라벨)
- 결제 = 스토어 IAP / 구독취소 = 결제주기 종료 시
- Gemini 등 유료 플랜만 (무료 플랜 = 데이터 학습 위험)

[기술]
- 비밀키 = Secret Manager (코드/깃 금지)
- 어댑터 외 코드에 공급자 SDK import 금지
- 모든 외부 호출 try/catch + 폴백
- 엔진은 순수함수 지향 (테스트 가능)
- 타입: TypeScript strict

[코어 정체성]
- 음성 게이트 우회 코드 금지
- judge()에 자유생성 판단 금지 (골격만)
- 네이티브 speech-to-speech 도입 금지
```

---

## 10. 환경/실행

```
런타임   Node 20+ / RN(Expo) / Cloud Run
패키지   pnpm workspace + turborepo
테스트   vitest (engine 단위), 어댑터는 mock
secrets  GEMINI_KEY, DEEPGRAM_KEY, ELEVENLABS_KEY,
         CARTESIA_KEY, FIREBASE_* → Secret Manager
배포     services/api → Cloud Run / mobile → EAS
```

---

## 11. 용량 거버넌스 & 압축 (용량 폭증 방지)

> 두 곳에서 터진다: **content_cache**(빌드 산출물·곱셈 증가)·**events**(append-only·무한 누적).
> 원칙: 압축 포맷 기본 + dedup + 지연로딩 + 콜드 아카이브 + 용량 예산.

```
[압축 포맷 — 무압축 저장 금지]
- 음성(TTS/회복)    Opus 24~32kbps mono       (WAV 대비 ~16×↓)
- 이미지(캐릭/배경)  AVIF/WebP + 해상도 티어    (PNG 대비 ~10×↓)
- BGM/앰비언스      Opus 64~96kbps + 루프 메타  (WAV 대비 ~15×↓)
- 목표: 에피소드당 압축 후 ≤ 8MB (무압축 ~66MB)

[dedup & 매니페스트]
- content-hash로 동일 발화/표정/루프는 1벌만 저장 → 참조 공유
- content_cache/{episodeId}/manifest.json (url·hash·bytes)
- 빌드가 총량 리포트 + 에피소드 예산 초과 시 실패

[지연 로딩 & 제거]
- 전체 선다운로드 금지 → 에피소드 진입 시 on-demand fetch
- 디바이스 캐시 상한(예: 200MB) 초과 시 오래된 에피소드 자산 LRU evict

[이벤트 소싱 압축]
- snapshots 주기 집계 → 핫 readModel만 즉시
- 콜드 이벤트는 월별 gzip 아카이브(객체스토리지 저비용 티어, ~8×↓)
- 음성 원본 즉시 폐기 / 복습녹음 TTL 30일 (§6·§9 유지)

[로컬 개발 운영 — 별도]
- Codex(`~/.codex`)는 전역 도구 데이터 — 사용자 동의 없이 삭제·정리 금지(설정·인증 포함)
- Ollama 모델 1벌 유지 · Qwen RAM 상주는 메모리 여유 시만
```

[규모 시나리오 — 압축 전 → 후]

| 규모 | content_cache | events(1년) |
|---|---|---|
| MVP   ep3·char2  | 200MB → **18MB**  | 1K유저   2.2GB → **0.3GB** |
| 성장   ep30·char5 | 2GB  → **180MB** | 10K유저  22GB  → **3GB**  |
| 스케일 ep300·UGC | 20GB → **1.8GB** | 100K유저 220GB → **28GB** |

> 압축 없이 가면 스케일에서 ~240GB, 압축+아카이브로 ~30GB — 8배가 생존선.

---

## 부록 — 의사결정 로그 (왜 이렇게 짰나)

- 파이프라인 채택: 판정/학습에 전사 필수. 네이티브는 전사를 숨김.
- 엔진 패키지 분리: "같은 소스, 다른 방향" (음성게임/각본/UGC/다국어/B2B) 재사용.
- 어댑터 패턴: 공급자 단가/품질이 매주 바뀜 → 교체 가능해야 함.
- 캐시 우선: TTS/이미지가 비용 대부분 → 사전생성으로 live 비용 STT+판정만.
- 이벤트 소싱: Dive Lab 공통(Historia DNA), 성장추적·복습·대시보드 재사용.

*Dive Lab 로드맵: Abridge → Mily → JUPA → ComplyGate 이후 사이드 트랙 착수.*
