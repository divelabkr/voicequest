// 영속 EventStore — 3단 폴백: Firestore(서비스 계정 키 있으면) → 로컬 JSONL 파일 → (server 인메모리).
// 유저별 격리(events/{uid}): readModel은 그 유저것만 조회, 탈퇴 시 purge(잊혀질 권리 §9).
import { appendFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { EventStorePort, GameEvent, ReadModel } from "@voicequest/engine";
import { buildReadModel } from "@voicequest/engine";

export type { App as FirestoreApp } from "firebase-admin/app";

/** 파일명/문서ID 안전화 — 경로 traversal·특수문자 차단. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "anon";
}

// ── 파일 폴백(키 없을 때) ──
export class PersistentEventStore implements EventStorePort {
  private readonly file: string;
  constructor(dir: string, userId: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `${sanitizeId(userId)}.jsonl`);
  }
  async append(e: GameEvent): Promise<void> {
    appendFileSync(this.file, JSON.stringify(e) + "\n");
  }
  async readModel(): Promise<ReadModel> {
    if (!existsSync(this.file)) return buildReadModel([]);
    const events = readFileSync(this.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as GameEvent);
    return buildReadModel(events);
  }
  async purge(): Promise<void> {
    if (existsSync(this.file)) rmSync(this.file);
  }
}

// ── Firestore 영속(서비스 계정 키 있을 때) ──
export class FirestoreEventStore implements EventStorePort {
  private readonly db: Firestore;
  constructor(app: App, private readonly userId: string) {
    this.db = getFirestore(app);
  }
  private log() {
    return this.db.collection("events").doc(sanitizeId(this.userId)).collection("log");
  }
  async append(e: GameEvent): Promise<void> {
    await this.log().add(e as Record<string, unknown>);
  }
  async readModel(): Promise<ReadModel> {
    const snap = await this.log().orderBy("ts").get();
    return buildReadModel(snap.docs.map((d) => d.data() as GameEvent));
  }
  async purge(): Promise<void> {
    const snap = await this.log().get();
    const batch = this.db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** 서비스 계정(JSON 문자열 또는 파일 경로)으로 Firebase App 초기화(싱글톤). 실패하면 null → 파일 폴백. */
export function initFirestore(serviceAccount: string): App | null {
  try {
    const json = serviceAccount.trim().startsWith("{") ? serviceAccount : readFileSync(serviceAccount, "utf8");
    const existing = getApps().find((a) => a?.name === "voicequest");
    return existing ?? initializeApp({ credential: cert(JSON.parse(json)) }, "voicequest");
  } catch {
    return null;
  }
}

/** 3단 폴백 — firestoreApp 있으면 Firestore, 없으면 파일. (둘 다 EventStorePort) */
export function makeEventStore(opts: { firestoreApp?: App | null; eventsDir: string; userId: string }): EventStorePort {
  if (opts.firestoreApp) return new FirestoreEventStore(opts.firestoreApp, opts.userId);
  return new PersistentEventStore(opts.eventsDir, opts.userId);
}
