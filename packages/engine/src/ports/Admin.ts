// AdminPort — 어드민(웹/모바일)이 배포 제어를 조작하는 계약. 구현: adapters/store-firestore.
// 런타임은 access.ts 정책으로 게이트를 "강제"하고, 어드민은 이 포트로 정책을 "운영"한다.
import type { ReleaseStage, MemberStatus } from "../access";

export interface AdminSnapshot {
  stage: ReleaseStage;
  activeCount: number;
  waitlistCount: number;
  blockedCount: number;
  paidCount: number;
  /** 오늘 전체 턴 수 — API 사용량 모니터 */
  turnsToday: number;
}

export interface AdminPort {
  /** 대시보드 요약(인원·사용량·단계) */
  snapshot(): Promise<AdminSnapshot>;
  /** 배포 단계 전환(alpha→pilot→ga) — 게이트 메트릭 충족 시 */
  setStage(stage: ReleaseStage): Promise<void>;
  /** 회원 상태 변경(차단·복구 등) */
  setMemberStatus(userId: string, status: MemberStatus): Promise<void>;
  /** 빈 자리만큼 웨이팅리스트 승급 → 승급된 userId 목록 */
  promoteWaitlist(count: number): Promise<string[]>;
}
