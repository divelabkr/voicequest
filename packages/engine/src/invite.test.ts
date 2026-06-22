import { describe, it, expect } from "vitest";
import { issueInvite, redeemInvite, revokeInvite } from "./invite";

describe("invite", () => {
  it("issued 코드를 유저에 바인딩한다", () => {
    const inv = issueInvite("VQ-AAAA", 1000, "tester");
    const r = redeemInvite(inv, "user_1", 2000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invite.status).toBe("redeemed");
      expect(r.invite.boundUserId).toBe("user_1");
      expect(r.invite.redeemedTs).toBe(2000);
    }
  });

  it("같은 유저의 재입장은 멱등 허용한다", () => {
    const used = redeemInvite(issueInvite("VQ-B", 1), "user_1", 2);
    expect(used.ok).toBe(true);
    if (used.ok) {
      const again = redeemInvite(used.invite, "user_1", 3);
      expect(again.ok).toBe(true);
    }
  });

  it("다른 유저의 재사용은 거부한다(유출 방어)", () => {
    const used = redeemInvite(issueInvite("VQ-C", 1), "user_1", 2);
    expect(used.ok).toBe(true);
    if (used.ok) {
      const attacker = redeemInvite(used.invite, "attacker", 3);
      expect(attacker.ok).toBe(false);
      if (!attacker.ok) expect(attacker.reason).toBe("already_redeemed");
    }
  });

  it("폐기된 코드는 거부한다", () => {
    const r = redeemInvite(revokeInvite(issueInvite("VQ-D", 1)), "user_2", 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("revoked");
  });

  it("없는 코드는 not_found", () => {
    const r = redeemInvite(undefined, "user_3", 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });
});
