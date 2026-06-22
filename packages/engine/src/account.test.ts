import { describe, it, expect } from "vitest";
import { signup, canUseVoice, withdraw } from "./account";

const fullConsent = { overseasTransfer: true, dataProcessing: true };

describe("account (라이프사이클: 가입→활성→탈퇴)", () => {
  it("동의 다 있으면 active, 빠지면 pending_consent", () => {
    expect(signup("u", fullConsent, 0).status).toBe("active");
    expect(signup("u", { overseasTransfer: false, dataProcessing: true }, 0).status).toBe("pending_consent");
  });

  it("음성은 active + 국외이전 동의 시만(§9)", () => {
    expect(canUseVoice(signup("u", fullConsent, 0))).toBe(true);
    expect(canUseVoice(signup("u", { overseasTransfer: false, dataProcessing: true }, 0))).toBe(false);
    expect(canUseVoice(undefined)).toBe(false);
  });

  it("탈퇴 — withdrawn + 데이터 삭제 대상(잊혀질 권리)", () => {
    const w = withdraw(signup("u", fullConsent, 0));
    expect(w.account.status).toBe("withdrawn");
    expect(w.purge).toContain("events");
    expect(w.purge).toContain("sessions");
  });
});
