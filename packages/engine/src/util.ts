// 공용 유틸 — 순수.
/** 파일명/문서 ID 안전화 — 경로 traversal·특수문자 차단(유저 입력 방어). store·server 공용 SSOT. */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "anon";
}
