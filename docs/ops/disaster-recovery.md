# VoiceQuest 재해 복구(DR) Runbook

> 백업·복원 절차 SSOT. **"백업 있다"≠"복구된다"** — restore drill로 검증한다.
> 최종 drill: **2026-06-26 17:19 KST (8/8 pass)**. 관련: `server.ts`(atomic write·load 손상감지), `scripts/restore-drill.mjs`.

이 Runbook은 **내구성·복구(durability)** 축을 다룬다. 가용성(폴백·멀티인스턴스·멀티리전)은 별도 — STT 폴백(PR#14)·Phase 2~3 참조.

## 1. 백업 대상

| 데이터 | 경로 | 내용 | 재생성? |
|---|---|---|---|
| 상태 스냅샷 | `data/vq-state.json` | accounts·invites·daily·freetalk·tokens | ✗ 유실 시 복구 불가 |
| 이벤트 로그 | `data/events/{uid}.jsonl` | 성장·턴 이벤트(append-only) | ✗ |
| 콘텐츠 캐시 | `content_cache/` | NPC 음성·이미지 | ✅ git 추적 + cacheBuild 재생성 |

→ **백업 필수 = `vq-state.json` + `events/`**. content_cache는 git/재생성이라 제외.

## 2. 백업 메커니즘

- **클라우드**: Cloud Storage 버킷 `gs://voicequest-data-418332850464` → `/app/data` 마운트 + **object versioning 켜짐**(덮어쓰기 시 이전 버전 보존).
- **atomic write**(`server.ts` saveState/flushStateSync): 모든 저장은 `.tmp` 기록 후 `rename`(원자적 교체). 직렬화 중 크래시·디스크풀에도 상태파일 손상 없음.
- **load 손상 감지**(`server.ts`): 부팅 시 parse 실패하면 "파일 없음(첫 실행)"과 "손상"을 `existsSync`로 구분해 경고 → 복원 트리거.

## 3. RPO / RTO

| 지표 | 값 | 근거 |
|---|---|---|
| RPO(정상종료) | **0** | SIGTERM/SIGINT에 `flushStateSync` 동기 기록 |
| RPO(크래시·SIGKILL) | **~수초** | 디바운스 200ms — 마지막 saveState 이후만 유실 |
| RTO | 분 단위 | 버킷 버전 복원 + 재배포(수동) |

> 진짜 PITR(시점복구)은 **Phase 1(Firestore 연결)**에 딸려옴 — Firestore PITR 7일 자동(구글 관리). 현재 파일 영속은 버킷 versioning이 한계.

## 4. 복원 절차

### A. 로컬/개발
```bash
# 손상 의심 시 — 백업본으로 교체 후 재기동
cp data/vq-state.json.bak data/vq-state.json    # 또는 버킷에서 받은 버전
pnpm dev                                         # load 로그에 accounts 수 확인
```

### B. 클라우드(버킷 versioning 복원)
```bash
# 1) 버전 목록(시점별 generation 확인)
gcloud storage objects list gs://voicequest-data-418332850464/vq-state.json \
  --all-versions --project voicequest-dev
# 2) 특정 generation(시점)으로 복원
gcloud storage cp \
  gs://voicequest-data-418332850464/vq-state.json#<GENERATION> \
  gs://voicequest-data-418332850464/vq-state.json --project voicequest-dev
# 3) Cloud Run 재시작(인스턴스가 마운트 재로드)
gcloud run services update voicequest-api --region asia-northeast3 --project voicequest-dev
```

## 5. restore drill(정기 검증)

```bash
pnpm drill        # = node scripts/restore-drill.mjs
```
백업/atomic write/손상감지/복원/정합 8종 검증. **실제 상태파일은 sandbox 복사본으로 보호**(무손상).

**최종 drill 결과 — 2026-06-26 17:19 KST: 8 pass / 0 fail**
- 베이스라인 accounts=12 · invites=20 · tokens=1
- atomic write(`.tmp`→rename) 정상 / 임시파일 미잔존
- 손상(truncated) 파일 = parse 실패 감지
- 복원 후 accounts·invites·tokens 전부 정합
- sandbox 정리 잔여물 0

> 권장 주기: **알파 후 주 1회**(운영 주간 할일). 클라우드 실제 버킷 drill(§4-B)은 배포 변경 시 1회.

## 6. 한계 / 후속

- 현재 단일 인스턴스(`max-instances=1`) — 상태 일관. 스케일 시 **Phase 1(상태 외부화)** 필수.
- 버킷 versioning 보존정책 미설정 → noncurrent version TTL 설정 권장(비용·보존 균형).
- **Phase 1(Firestore)** 에서 PITR 7일 + 자동 백업 확보 → 본 Runbook §3·§4-B 대체.

관련: `docs/legal/`(개인정보·약관) · `server.ts` · `scripts/restore-drill.mjs`
