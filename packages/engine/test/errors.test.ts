import { describe, it, expect } from "vitest";
import { emptyErrors, recordError, summarizeErrors, sanitizeError, errorGuide } from "../src/errors";

describe("errors — 에러 관측 SSOT(복구 없음, 관측·추적·가이드만)", () => {
  it("sanitize — 토큰·이메일·초대코드·홈경로 마스킹(민감정보 노출 X)", () => {
    expect(sanitizeError("token=abc123secret")).toContain("<redacted>");
    expect(sanitizeError("user@example.com 실패")).toContain("<email>");
    expect(sanitizeError("코드 VQ-ABCD-1234 막힘")).toContain("<code>");
    expect(sanitizeError("/Users/yongj/app 에러")).toContain("/Users/<user>");
  });

  it("종류별 누적 + 빈도순 + 가이드(점검 방향)", () => {
    let m = emptyErrors();
    m = recordError(m, { kind: "client_fetch", message: "Failed to fetch", where: "admin", ts: 1 });
    m = recordError(m, { kind: "client_fetch", message: "Failed to fetch", where: "web", ts: 2 });
    m = recordError(m, { kind: "stt_fail", message: "deepgram 429", where: "session", ts: 3 });
    const s = summarizeErrors(m);
    expect(s.total).toBe(3);
    expect(s.byKind[0]).toMatchObject({ kind: "client_fetch", count: 2 });
    expect(s.byKind[0]!.guide).toContain("reverse"); // 가이드 = 점검 방향, 복구 명령 아님
  });

  it("최근순 보관 + sanitize 적용", () => {
    let m = emptyErrors();
    m = recordError(m, { kind: "client_js", message: "secret: xyzABC", where: "web", ts: 5 });
    expect(summarizeErrors(m).recent[0]!.message).toContain("<redacted>");
  });

  it("미분류 가이드 폴백", () => {
    expect(errorGuide("unknown_kind")).toContain("미분류");
  });
});
