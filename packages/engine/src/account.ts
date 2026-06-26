// 계정 라이프사이클 — 순수. 가입(동의)→활성→탈퇴(데이터 삭제).
// §9: 국외이전 동의 없이 STT/TTS(해외 API) 호출 금지 · 탈퇴 = 잊혀질 권리(데이터 삭제).
export type AccountStatus = "pending_consent" | "active" | "withdrawn";

export interface ConsentFlags {
  /** 국외이전(STT/TTS가 해외 API) — 없으면 음성 호출 금지 */
  overseasTransfer: boolean;
  /** 개인정보 처리 */
  dataProcessing: boolean;
}

export interface Account {
  userId: string;
  status: AccountStatus;
  consent: ConsentFlags;
  createdTs: number;
  /** 친구 초대 보상 — 1달 무료 누적(초대자·피초대자 양쪽 +1). 알파(무료)는 적립만, 유료 전환 시 차감. */
  referralMonths?: number;
}

/** 가입 — 두 동의가 다 있으면 active, 아니면 pending_consent(음성 사용 불가). */
export function signup(userId: string, consent: ConsentFlags, ts: number): Account {
  const ok = consent.overseasTransfer && consent.dataProcessing;
  return { userId, status: ok ? "active" : "pending_consent", consent, createdTs: ts, referralMonths: 0 };
}

/** 친구 초대 보상 적립 — 1달 무료 누적. 알파는 적립만(유료 전환 시 차감). */
export function grantReferral(account: Account, months = 1): Account {
  return { ...account, referralMonths: (account.referralMonths ?? 0) + months };
}

/** 음성(STT/TTS 해외) 사용 가능? active + 국외이전 동의 시만(§9 동의 게이트). */
export function canUseVoice(account: Account | undefined): boolean {
  return account?.status === "active" && account.consent.overseasTransfer;
}

/** 탈퇴 — 잊혀질 권리. withdrawn 처리 + 삭제 대상 데이터 키 반환(서버가 purge). */
export function withdraw(account: Account): { account: Account; purge: string[] } {
  return {
    account: { ...account, status: "withdrawn" },
    purge: ["events", "sessions", "review_recordings"],
  };
}
