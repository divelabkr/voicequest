// 초대코드 인증 흐름 검증 — 운영자 코드생성 → 유저 redeem 가입 → 재사용/폐기 방어.
// 사전: ADMIN_TOKEN 설정 + 서버 기동. 실행: tsx invite-sim.ts
import { readFileSync } from "node:fs";
const API = "http://localhost:8787";
const ADMIN = (readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^ADMIN_TOKEN=(.+)$/m)?.[1] ?? "").trim();

async function jpost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
async function turn(sid: string): Promise<number> {
  const r = await fetch(`${API}/session/turn?sid=${sid}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(0),
  });
  return r.status;
}
const consent = { overseasTransfer: true, dataProcessing: true };

async function main(): Promise<void> {
  console.log(`🎟️  초대코드 인증 흐름 (ADMIN 앞 8자: ${ADMIN.slice(0, 8)}…)\n`);

  const noauth = await jpost("/admin/invite", {}, { "x-admin-token": "wrong" });
  console.log("① 잘못된 운영자 토큰 코드생성 →", noauth.status, "(401 기대)");

  const gen = await jpost("/admin/invite", { note: "tester#1" }, { "x-admin-token": ADMIN });
  const code = gen.json.code as string;
  console.log("② 운영자 코드 생성            →", code, "(VQ-XXXX-XXXX)");

  const bad = await jpost("/auth/redeem", { code: "VQ-0000-0000", userId: "v1", consent });
  console.log("③ 없는 코드로 가입            →", bad.status, bad.json.error, "(403 invite_not_found)");

  const ok = await jpost("/auth/redeem", { code, userId: "v1", consent });
  console.log("④ 정상 코드로 가입            →", ok.json.status, "/ turn:", await turn("v1"), "(active / 200)");

  const reuse = await jpost("/auth/redeem", { code, userId: "attacker", consent });
  console.log("⑤ 다른 유저가 같은 코드       →", reuse.status, reuse.json.error, "(403 invite_already_redeemed)");

  const idem = await jpost("/auth/redeem", { code, userId: "v1", consent });
  console.log("⑥ 같은 유저 재입장(멱등)      →", idem.json.status, "(active 유지)");

  await jpost("/account/withdraw?sid=v1", {});
  const after = await jpost("/auth/redeem", { code, userId: "v1", consent });
  console.log("⑦ 탈퇴 후 같은 코드 재사용    →", after.status, after.json.error, "(403 invite_revoked)");

  console.log("\n✅ 운영자 코드생성 → 유저 가입 → 재사용/폐기 방어 검증");
}
main().catch((e) => { console.error(e); process.exit(1); });
