import { describe, it, expect } from "vitest";
import { sanitizeId } from "../src/util";

describe("sanitizeId — ID 안전화(store·server 공용 SSOT)", () => {
  it("traversal·특수문자 차단(/, . 제거)", () => {
    const s = sanitizeId("../../etc/passwd");
    expect(s).not.toMatch(/[/.]/);
    expect(sanitizeId("user@x.com")).toBe("user_x_com");
  });
  it("정상 ID 유지 + 빈 입력 방어", () => {
    expect(sanitizeId("abc_123-XY")).toBe("abc_123-XY");
    expect(sanitizeId("")).toBe("anon");
  });
  it("80자 상한", () => {
    expect(sanitizeId("a".repeat(100)).length).toBe(80);
  });
});
