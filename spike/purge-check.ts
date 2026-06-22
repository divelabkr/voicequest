// ③ 잊혀질 권리 실증 — PersistentEventStore가 유저별 파일을 만들고 purge로 지우는지.
// 실행: tsx purge-check.ts
import { PersistentEventStore } from "../packages/adapters/store-firestore/src/index.js";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../data/events-test/", import.meta.url));

async function main(): Promise<void> {
  const uid = "user_가나#test/../evil"; // 특수문자·traversal 포함 → sanitize 검증
  const s = new PersistentEventStore(dir, uid);
  await s.append({ type: "energy_spent", amount: 1, ts: 1 });
  await s.append({ type: "turn_spoken", sceneId: "s1", transcript: "x", grade: "B", weakness: [], ts: 2 });
  console.log("append 후 파일:", readdirSync(dir));

  const rm = await s.readModel();
  console.log("readModel 동작:", !!rm.stats6, "· affinity 키:", Object.keys(rm.affinity).length);

  await s.purge();
  const left = existsSync(dir) ? readdirSync(dir) : [];
  console.log("purge 후 파일:", left);
  console.log(left.length === 0 ? "✅ 유저 이벤트 파일 삭제됨 — 잊혀질 권리 충족(§9)" : "⚠️ 파일 잔존");
  rmSync(dir, { recursive: true, force: true }); // 테스트 디렉토리 정리
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
