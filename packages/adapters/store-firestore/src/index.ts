// 영속 EventStore — Firebase 키가 있으면 Firestore, 없으면 로컬 JSONL 파일로 폴백.
// 유저별 파일(events/{uid}.jsonl): readModel은 그 유저것만 parse(전체 스캔 회피),
// 탈퇴 시 purge로 파일 삭제(잊혀질 권리 §9). 영속 연결돼도 유저 분리가 보장된다.
import { appendFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { EventStorePort, GameEvent, ReadModel } from "@voicequest/engine";
import { buildReadModel } from "@voicequest/engine";

export class PersistentEventStore implements EventStorePort {
  private readonly file: string;
  constructor(dir: string, userId: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `${sanitizeId(userId)}.jsonl`);
  }
  async append(e: GameEvent): Promise<void> {
    appendFileSync(this.file, JSON.stringify(e) + "\n");
  }
  async readModel(_userId: string): Promise<ReadModel> {
    if (!existsSync(this.file)) return buildReadModel([]);
    const events = readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as GameEvent);
    return buildReadModel(events);
  }
  /** 잊혀질 권리 — 이 유저의 이벤트 파일을 삭제(§9 withdraw.purge). */
  async purge(): Promise<void> {
    if (existsSync(this.file)) rmSync(this.file);
  }
}

/** 파일명 안전화 — 경로 traversal·특수문자 차단(유저 입력 id 방어). */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "anon";
}
