// EventStorePort — 이벤트 append-only + read model 조회. 구현: adapters/store-firestore.
import type { GameEvent, ReadModel } from "../types";

export interface EventStorePort {
  append(e: GameEvent): Promise<void>;
  readModel(userId: string): Promise<ReadModel>;
  /** 잊혀질 권리(§9) — 이 유저의 모든 이벤트 삭제. 영속 구현만 제공(인메모리는 생략 가능). */
  purge?(userId: string): Promise<void>;
}
