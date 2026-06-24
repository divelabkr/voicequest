// HTTP 라우트 통합 테스트 — server.ts 핸들러를 port 0으로 띄워 실제 fetch로 게이트·보안 회귀 차단.
// engine·session 단위 테스트가 못 잡는 "라우트 레벨"(인증·brute-force·본문상한·버전게이트·rate)을 검증.
// 외부 호출(STT/LLM) 없는 순수 게이트 경로만 — DEEPGRAM 등 실어댑터는 호출하지 않는다.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AddressInfo } from "node:net";

// ⚠ server.ts import 전에 버전 게이트를 켠다. .env엔 MIN_APP_VERSION이 없어 process.env 값이 채택됨(loadEnv 폴백).
//   ADMIN_TOKEN은 .env 값이 우선이라 여기서 못 덮어씀 → 아래 dynamic import 후 실제 값을 가져와 쓴다.
process.env.MIN_APP_VERSION = "1.0.0";

// 동적 import — 위 env 설정이 모듈 로드 시점에 반영되도록(정적 import는 호이스팅돼 env보다 먼저 평가됨).
const { server, ADMIN_TOKEN, MIN_APP_VERSION, AUTH_FAIL_PER_MIN, TURN_PER_MIN, turnRateOk, __resetGates } =
  await import("./server");

const APP_VER = "1.0.0"; // 버전 게이트 통과용 헤더(MIN과 동일 → needsUpdate=false). 비-게이트 케이스 전부에 부착.
let base = "";

beforeAll(async () => {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done)); // port 0 = OS 할당, 외부 노출 없음
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => { __resetGates(); }); // loopback IP가 테스트 간 공유돼 rate 카운터 누적되는 것 차단

describe("server.ts HTTP 라우트(게이트·보안)", () => {
  it("MIN_APP_VERSION이 import 전 env로 켜졌다(버전게이트 테스트 전제)", () => {
    expect(MIN_APP_VERSION).toBe("1.0.0");
  });

  it("ADMIN_TOKEN이 설정돼 있다(.env) — 인증 성공 경로 검증 가능", () => {
    // 값은 절대 로그/노출 금지. 존재 여부만 단언(없으면 인증 200 케이스가 무의미).
    expect(ADMIN_TOKEN.length).toBeGreaterThan(0);
  });

  it("GET /health → 200 + { ok:true } (버전게이트 면제)", async () => {
    const r = await fetch(`${base}/health`); // x-app-version 없이도 통과해야 함
    expect(r.status).toBe(200);
    const j = await r.json() as { ok: boolean };
    expect(j.ok).toBe(true);
  });

  it("GET /episodes → 200 + episodes 배열", async () => {
    const r = await fetch(`${base}/episodes`, { headers: { "x-app-version": APP_VER } });
    expect(r.status).toBe(200);
    const j = await r.json() as { episodes: unknown[] };
    expect(Array.isArray(j.episodes)).toBe(true);
    expect(j.episodes.length).toBeGreaterThan(0); // content/episodes JSON이 1개 이상 로드됨
  });

  it("admin 인증: GET /admin/stats 무토큰 → 401 admin_only", async () => {
    const r = await fetch(`${base}/admin/stats`, { headers: { "x-app-version": APP_VER } });
    expect(r.status).toBe(401);
    const j = await r.json() as { error: string };
    expect(j.error).toBe("admin_only");
  });

  it("admin 인증: 올바른 토큰 → 200 (timing-safe 비교 통과)", async () => {
    const r = await fetch(`${base}/admin/stats`, { headers: { "x-app-version": APP_VER, "x-admin-token": ADMIN_TOKEN } });
    expect(r.status).toBe(200);
    const j = await r.json() as { capacity: number };
    expect(typeof j.capacity).toBe("number"); // /admin/stats 응답 형태
  });

  it("admin 인증: 잘못된 토큰(길이 동일/내용 불일치) → 401 (timing-safe false)", async () => {
    const wrong = "x".repeat(ADMIN_TOKEN.length || 8); // 길이 같아도 byteLength 동일 → timingSafeEqual false
    const r = await fetch(`${base}/admin/stats`, { headers: { "x-app-version": APP_VER, "x-admin-token": wrong } });
    expect(r.status).toBe(401);
  });

  it("brute-force: 잘못된 admin 토큰 연타 → 한도 초과 시 429 too_many_attempts", async () => {
    // 코드 경계: authFailOk는 count <= AUTH_FAIL_PER_MIN(10)까지 허용 → 11회까진 401, 12회째 429.
    //   (loopback 단일 IP·같은 분 가정. beforeEach __resetGates로 카운터 0에서 시작.)
    const statuses: number[] = [];
    for (let i = 0; i < AUTH_FAIL_PER_MIN + 2; i++) { // 12회
      const r = await fetch(`${base}/admin/stats`, { headers: { "x-app-version": APP_VER, "x-admin-token": "bad" } });
      statuses.push(r.status);
    }
    // 처음 (한도+1)회는 401, 그 다음부터 429
    expect(statuses.slice(0, AUTH_FAIL_PER_MIN + 1).every((s) => s === 401)).toBe(true);
    const last = statuses[statuses.length - 1]!;
    expect(last).toBe(429);
    // 마지막 429 본문 확인
    const r = await fetch(`${base}/admin/stats`, { headers: { "x-app-version": APP_VER, "x-admin-token": "bad" } });
    expect(r.status).toBe(429);
    const j = await r.json() as { error: string };
    expect(j.error).toBe("too_many_attempts");
  });

  it("본문 상한: 6MB 본문 → 413 payload_too_large", async () => {
    // /client-error는 버전게이트 면제 + readBody로 본문 상한 검사 → 외부 호출 없이 413 경로만 탄다.
    const big = "a".repeat(6 * 1024 * 1024); // 6MB > MAX_BODY(5MB)
    const r = await fetch(`${base}/client-error`, { method: "POST", body: big });
    expect(r.status).toBe(413);
    const j = await r.json() as { error: string };
    expect(j.error).toBe("payload_too_large");
  });

  it("버전 게이트: x-app-version이 MIN 미만 → 426 upgrade_required", async () => {
    const r = await fetch(`${base}/episodes`, { headers: { "x-app-version": "0.9.0" } }); // < 1.0.0
    expect(r.status).toBe(426);
    const j = await r.json() as { error: string; minVersion: string };
    expect(j.error).toBe("upgrade_required");
    expect(j.minVersion).toBe(MIN_APP_VERSION);
  });

  it("버전 게이트: 헤더 없으면 비-면제 라우트도 통과(레거시 관대) — 401로 라우트엔 도달", async () => {
    // needsUpdate(undefined,...)=false → 게이트 통과. /admin/stats는 토큰 없어 401(게이트 426 아님)이어야 함.
    const r = await fetch(`${base}/admin/stats`); // x-app-version 미전송
    expect(r.status).toBe(401); // 426이면 게이트가 헤더 누락을 오차단한 회귀
  });

  it("알 수 없는 경로 → 404 not_found", async () => {
    const r = await fetch(`${base}/nope`, { headers: { "x-app-version": APP_VER } });
    expect(r.status).toBe(404);
    const j = await r.json() as { error: string };
    expect(j.error).toBe("not_found");
  });

  it("OPTIONS preflight → 204 (게이트 이전 처리)", async () => {
    const r = await fetch(`${base}/session/turn`, { method: "OPTIONS" });
    expect(r.status).toBe(204);
  });
});

// turn rate limit은 audio/STT가 필요해 라우트 직접 검증 대신 게이트 헬퍼(turnRateOk)를 단위 검증.
// /session/turn은 같은 sid가 분당 TURN_PER_MIN(20)회 넘으면 429 rate_limited를 반환 → 그 골격이 여기서 잠긴다.
describe("turnRateOk (turn 분당 burst 게이트)", () => {
  it("같은 sid·같은 분: TURN_PER_MIN회까진 true, 그 다음 false", () => {
    __resetGates();
    const now = 1_000_000 * 60_000; // 분 경계에 고정(이 테스트 내 동일 분 유지)
    const sid = "rate-sid";
    for (let i = 0; i < TURN_PER_MIN; i++) {
      expect(turnRateOk(sid, now)).toBe(true); // 1..20회: 통과
    }
    expect(turnRateOk(sid, now)).toBe(false); // 21회째: 차단(429 rate_limited)
  });

  it("분이 바뀌면 카운터 리셋 → 다시 통과", () => {
    __resetGates();
    const sid = "rate-sid2";
    const m0 = 2_000_000 * 60_000;
    for (let i = 0; i < TURN_PER_MIN; i++) turnRateOk(sid, m0);
    expect(turnRateOk(sid, m0)).toBe(false);      // 같은 분 초과
    expect(turnRateOk(sid, m0 + 60_000)).toBe(true); // 다음 분 → 리셋
  });
});
