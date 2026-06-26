# VoiceQuest 비용 가이드 — 월 5000원 한도

> 목표: **월 총비용 ≤ 5000원**(≈$3.5, 환율~1430 보수). 단가 SSOT = `packages/engine/src/budget.ts`.
> 정밀 정산이 아니라 **폭주 차단**이 목적 — 실제 청구는 각 공급자 대시보드로 확인.

## 1. 비용이 어디로 나가나 — 3개 지갑

| 지갑 | 무엇 | 결제처 | 5000원 가드 |
|---|---|---|---|
| **GCP** (voicequest-dev) | Cloud Run·Build·Storage·**Gemini STT(폴백)** | billing `01397B-…` | ✅ 예산 알림 5000KRW |
| **Deepgram** | STT 1순위 | 별도 계정 크레딧 | 계정 대시보드 |
| **Anthropic** | Haiku judge 폴백(클라우드) | 별도 계정 크레딧 | 계정 대시보드 |

핵심: **비용 대부분은 외부 API(Deepgram STT + Haiku judge)**. GCP는 scale-to-zero라 인프라 자체는 미미(주로 Gemini 폴백분).

## 2. 단가 (budget.ts, 보수 추정)

| 항목 | turn당 | 비고 |
|---|---|---|
| STT (Deepgram) | $0.001 | 짧은 발화 1회 |
| STT 폴백 (Gemini) | ~$0.001 | **Deepgram 장애 시만** (정상=0) |
| judge (Haiku, 클라우드) | $0.0008 | 정답 fast-path=0, 캐시 반복=0 |
| judge (Qwen, 로컬) | $0 | ollama — 로컬 개발 |
| TTS·이미지 | $0 (런타임) | 빌드타임 캐시(§11) |

→ **클라우드 turn당 ≈ $0.0018**(STT+judge). 캐시·fast-path로 실질 더 낮음.

## 3. 5000원으로 가능한 규모

```
5000원 ≈ $3.5
turn당 $0.0018  →  약 1,940 turn / 월
유저당 ~50 turn(알파 체험)  →  약 38명 / 월
```

→ 알파 25명 목표는 **여유 있게 5000원 안에 들어옴** ✅

## 4. 안전장치 (3중)

1. **앱 레벨** — `budget.ts`: 월 $3.5(5000원) cap, 50/80/100%(2500/4000/5000원) 알림. 초과 시 `checkBudget.withinCap=false` → 신규 유료호출 차단(서비스는 자막모드 등 degrade).
2. **GCP 레벨** — 예산 알림 5000KRW + Cloud Run `max-instances=1`(인스턴스 폭주 = 비용 폭주 1차 차단).
3. **구조 레벨** — NPC TTS·이미지 빌드타임 캐시(런타임 0), judge 로컬 Qwen 우선·`CachedLlm` 캐시·정답 fast-path.

## 5. STT 폴백(Gemini)의 비용 영향

- Gemini는 **Deepgram 장애·빈 전사 시에만** 호출 → **정상 운영 시 추가 비용 0**.
- 장애가 나도 turn당 ~$0.001(Deepgram과 동급)이라 5000원 한도 영향 미미.
- Gemini는 GCP(voicequest-dev) 청구 → 5000원 **GCP 예산 알림에 자동 포함**.

## 6. 5000원을 넘으면?

- **budget.ts**: `withinCap=false` → 신규 유료호출 차단(데이터·진행은 보존, 새 STT/judge만 막음).
- **GCP**: 5000KRW 알림 이메일 → 운영자가 상향 or 차단 판단.
- 권장: 알파에선 5000원 도달을 **"성장 신호"로**(많이 쓰임=관심). 단 폭주(버그·악용)는 `max-instances`·rate limit이 먼저 막음.

## 7. 모니터링

- **admin 콘솔 비용 탭** — `costMeter`(월 STT/judge/gen 횟수·추정 USD) + `checkBudget` 상태(알림 레벨).
- **GCP 콘솔** — 실제 청구(billing `01397B`).
- **Deepgram·Anthropic 대시보드** — 외부 API 실사용량.
- ⚠️ `budget.ts`는 **추정**(폭주 차단용). 실제 정산 ≠ 추정 — 월말 각 대시보드 대조.

관련: `docs/ops/disaster-recovery.md` · `packages/engine/src/budget.ts` · `scripts/gen-todo-xlsx.py`(주별 "비용 추세 리뷰")
