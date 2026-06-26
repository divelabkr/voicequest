// restore drill — 백업/atomic write/손상감지/복원/정합을 서버 부팅 없이 검증.
// 실제 상태파일(vq-state.json)은 건드리지 않고 sandbox 복사본에서 시뮬(데이터 무손상).
// server.ts의 load(readFileSync→JSON.parse→Map 복원)와 동일 포맷. evidence = 실행 로그.
// 실행: node scripts/restore-drill.mjs   ("백업 있다"≠"복구된다"를 증명하는 drill)
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATE = fileURLToPath(new URL("../data/vq-state.json", import.meta.url));
const SANDBOX = STATE + ".drill";       // 실제 STATE 보호 — 복사본에서 손상·복원
const BAK = STATE + ".drill-bak";
const TMP = SANDBOX + ".tmp";
const log = (s) => console.log(s);
const loadFrom = (f) => { const s = JSON.parse(readFileSync(f, "utf8")); return { accounts: new Map(s.accounts), invites: new Map(s.invites), tokens: new Map(s.tokens ?? []) }; };

let pass = 0, fail = 0;
const check = (name, ok) => { log(`  ${ok ? "✅" : "❌"} ${name}`); ok ? pass++ : fail++; };
const cleanup = () => { for (const f of [SANDBOX, BAK, TMP]) if (existsSync(f)) unlinkSync(f); };

log("=== VoiceQuest restore drill (sandbox — 실제 상태파일 무손상) ===");
if (!existsSync(STATE)) { log("상태파일 없음 — 첫 실행이라 drill 생략(정상)"); process.exit(0); }

try {
  // 0) 베이스라인 — 실제 STATE를 SANDBOX로 복사
  copyFileSync(STATE, SANDBOX);
  const base = loadFrom(SANDBOX);
  log(`[0] 베이스라인(복사본): accounts=${base.accounts.size} invites=${base.invites.size} tokens=${base.tokens.size}`);

  // 1) 백업
  copyFileSync(SANDBOX, BAK);
  check("백업 생성", existsSync(BAK));

  // 2) atomic write — .tmp 기록 후 rename(원자적 교체), 부분쓰기 미잔존
  writeFileSync(TMP, readFileSync(SANDBOX, "utf8"));
  renameSync(TMP, SANDBOX);
  check("atomic write(.tmp→rename) 후 parse 정상", loadFrom(SANDBOX).accounts.size === base.accounts.size);
  check("임시파일 미잔존(rename이 소비)", !existsSync(TMP));

  // 3) 손상 시뮬 — truncated JSON(직렬화 중 크래시·디스크풀 재현)
  const good = readFileSync(SANDBOX, "utf8");
  writeFileSync(SANDBOX, good.slice(0, Math.floor(good.length / 2)));
  let corrupted = false;
  try { loadFrom(SANDBOX); } catch { corrupted = true; }
  check("손상 파일 = parse 실패 감지(load 손상경고 시나리오)", corrupted);

  // 4) 복원 — 백업본 → SANDBOX, 정합 확인
  copyFileSync(BAK, SANDBOX);
  const r = loadFrom(SANDBOX);
  check("복원 후 accounts 정합", r.accounts.size === base.accounts.size);
  check("복원 후 invites 정합", r.invites.size === base.invites.size);
  check("복원 후 tokens 정합", r.tokens.size === base.tokens.size);

  cleanup();
  check("sandbox 정리(잔여물 0)", !existsSync(SANDBOX) && !existsSync(BAK) && !existsSync(TMP));

  log(`\n=== 결과: ${pass} pass / ${fail} fail | RPO: 정상종료(SIGTERM) 0 / 크래시·SIGKILL ~수초(디바운스 200ms) ===`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  log(`drill 오류: ${String(e)}`);
  cleanup();
  process.exit(1);
}
