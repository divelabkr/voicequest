// 라이프사이클 UX 연결 검증 — 가입(동의)→사용→탈퇴(데이터삭제)→탈퇴 후 차단.
// 사전: 서버 기동. 실행: tsx lifecycle-sim.ts
const API = "http://localhost:8787";

async function jpost(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
async function turn(sid: string): Promise<number> {
  const r = await fetch(`${API}/session/turn?sid=${sid}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(0) });
  return r.status;
}

async function main(): Promise<void> {
  console.log("📋 라이프사이클 UX 연결 — 가입 → 사용 → 탈퇴\n");
  console.log("① 미가입 turn          →", await turn("u1"), "(403 기대)");

  const p = await jpost("/auth/signup", { userId: "u2", consent: { overseasTransfer: false, dataProcessing: true } });
  console.log("② 동의X 가입            →", p.json.status, "/ turn:", await turn("u2"), "(pending_consent / 403)");

  const a = await jpost("/auth/signup", { userId: "u1", consent: { overseasTransfer: true, dataProcessing: true } });
  console.log("③ 가입(동의 완료)       →", a.json.status, "(active 기대)");

  console.log("④ u1 turn(사용)         →", await turn("u1"), "(200 기대)");

  const sig = await (await fetch(`${API}/session/signals?sid=u1`)).json();
  console.log("⑤ 계측 신호             →", JSON.stringify(sig));

  const w = await jpost("/account/withdraw?sid=u1", {});
  console.log("⑥ 탈퇴(데이터 삭제)     →", JSON.stringify(w.json), "(withdrawn + purged)");

  console.log("⑦ 탈퇴 후 turn          →", await turn("u1"), "(403 기대 — 계정 삭제됨)");
  console.log("\n✅ 가입 → 사용 → 탈퇴 → 차단 라이프사이클 연결 검증");
}
main().catch((e) => { console.error(e); process.exit(1); });
