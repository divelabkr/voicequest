// 라이브 클라우드 알파 스모크 — 가입→세션→NPC대사→음성캐시→budget E2E.
// 실제 음성 판정만 제외(마이크 필요). 테스트 계정은 끝에 자동 정리(withdraw·데이터 안 남김).
// 실행: BASE=<url> ADMIN_TOKEN=<tok> node scripts/smoke-alpha.mjs
const BASE = (process.env.BASE || "").replace(/\/$/, "");
const ADMIN = process.env.ADMIN_TOKEN || "";
if (!BASE || !ADMIN) { console.error("BASE·ADMIN_TOKEN env 필요"); process.exit(2); }
const uid = `smoke_${Date.now()}`;
let pass = 0, fail = 0, token = "";
const ok = (n, c) => { console.log(`  ${c ? "✅" : "❌"} ${n}`); c ? pass++ : fail++; };
const J = (h = {}) => ({ "content-type": "application/json", ...h });
const A = { "x-admin-token": ADMIN };

console.log(`=== 알파 라이브 스모크 @ ${BASE} ===`);
try {
  // 1) health
  const h = await fetch(`${BASE}/health`).then(r => r.json());
  ok(`health ok=${h.ok} stage=${h.stage} cap=${h.capacity} sessions=${h.sessions}`, h.ok === true);

  // 2) invite 발급(admin)
  const inv = await fetch(`${BASE}/admin/invite`, { method: "POST", headers: J(A), body: "{}" }).then(r => r.json());
  ok(`invite 발급 code=${inv.code}`, !!inv.code);

  // 3) redeem 가입(국외이전·데이터처리 동의)
  const rd = await fetch(`${BASE}/auth/redeem`, { method: "POST", headers: J(), body: JSON.stringify({ code: inv.code, userId: uid, consent: { overseasTransfer: true, dataProcessing: true } }) }).then(r => r.json());
  token = rd.token || "";
  ok(`redeem 가입 status=${rd.status} token=${token ? "발급✓" : "없음"}`, !!token);

  // 4) episodes(캐시 여부 — NPC 음성 사전생성)
  const eps = await fetch(`${BASE}/episodes`).then(r => r.json());
  const ep1 = (eps.episodes || []).find(e => e.id.startsWith("ep_01")) || (eps.episodes || [])[0];
  ok(`episodes ${eps.episodes?.length}편 / ep_01 cached=${ep1?.cached} aizuchi=${ep1?.aizuchi?.length}`, !!ep1 && ep1.cached === true);

  // 5) session/turn 빈 오디오 → NPC 첫 대사(음성게이트 user beat 대기 직전까지)
  const turn = await fetch(`${BASE}/session/turn?sid=${token}&ep=${ep1?.id || "ep_01"}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(0) }).then(r => r.json());
  const npc = turn.npcLine || turn.queue?.[0]?.npcLine || "";
  const audioUrl = turn.audioUrl || turn.queue?.[0]?.audioUrl || ep1?.aizuchi?.[0];
  ok(`session/turn NPC대사="${npc.slice(0, 26)}" audio=${audioUrl ? "✓" : "—"} scene=${turn.progress?.scene}/${turn.progress?.total}`, !!npc);

  // 6) cache 음성 서빙(NPC 음성 .m4a 실제 200)
  if (audioUrl) {
    const c = await fetch(`${BASE}${audioUrl}`);
    ok(`cache 음성 ${audioUrl.slice(0, 34)} HTTP${c.status} ${c.headers.get("content-type")}`, c.status === 200);
  } else ok("cache 음성 URL 없음", false);

  // 7) budget 미터(5000원 cap 반영 확인 — 재배포 후 $3.5)
  const bud = await fetch(`${BASE}/admin/budget`, { headers: A }).then(r => r.json());
  const cap = bud.budget?.monthlyUsdCap;
  ok(`budget estUsd=$${bud.meter?.estUsd} cap=$${cap}(${(cap * 1430).toFixed(0)}원) within=${bud.status?.withinCap}`, bud.budget != null);
} catch (e) {
  ok(`예외: ${String(e).slice(0, 80)}`, false);
} finally {
  // 8) 정리 — 테스트 계정 withdraw(잊혀질 권리·라이브에 데이터 안 남김)
  if (token) {
    try { const wd = await fetch(`${BASE}/account/withdraw?sid=${token}`, { method: "POST" }).then(r => r.json()); ok(`정리 withdraw status=${wd.status} purged=${wd.purged}`, wd.status === "withdrawn" || wd.purged != null); }
    catch (e) { ok(`정리 실패: ${String(e).slice(0, 60)}`, false); }
  }
  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
}
