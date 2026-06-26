// 초대 코드 — MVP 인증(알파 비공개 25명). 코드 문자열 생성은 서버(crypto)가 하고,
// 엔진은 상태전이만 담당한다(순수함수). 규칙:
//  · 1코드 = 1유저 바인딩 — 첫 사용 시 userId 고정(코드 유출 방어).
//  · 탈퇴/회수 시 폐기 — 이후 재사용 불가.
// account.ts와 함께 가입 게이트를 이룬다(초대코드 통과 + 동의 → active).
export type InviteStatus = "issued" | "redeemed" | "revoked";

export interface InviteCode {
  code: string;
  status: InviteStatus;
  boundUserId?: string;
  note?: string; // 운영자 메모(누구에게 발급했는지)
  issuedTs: number;
  redeemedTs?: number;
  /** 친구 초대 — 이 코드를 만든 유저(있으면 redeem 시 양쪽 1달 무료). 운영자 발급은 없음. */
  inviterUserId?: string;
}

/** 발급 — 운영자가 생성한 코드 문자열을 issued 상태로 등록. */
export function issueInvite(code: string, ts: number, note?: string, inviterUserId?: string): InviteCode {
  return { code, status: "issued", note, issuedTs: ts, inviterUserId };
}

export type RedeemResult =
  | { ok: true; invite: InviteCode }
  | { ok: false; reason: "not_found" | "already_redeemed" | "revoked" };

/** 사용 — issued만 가능. userId에 바인딩(1코드 1유저). 같은 유저의 재입장은 멱등 허용. */
export function redeemInvite(
  invite: InviteCode | undefined,
  userId: string,
  ts: number,
): RedeemResult {
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "redeemed") {
    return invite.boundUserId === userId
      ? { ok: true, invite }
      : { ok: false, reason: "already_redeemed" };
  }
  return {
    ok: true,
    invite: { ...invite, status: "redeemed", boundUserId: userId, redeemedTs: ts },
  };
}

/** 폐기 — 탈퇴/회수 시. 이후 redeem 불가. */
export function revokeInvite(invite: InviteCode): InviteCode {
  return { ...invite, status: "revoked" };
}
