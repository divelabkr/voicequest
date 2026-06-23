// 앱 버전 게이트 — 클라 버전이 server 최소 버전 미만이면 차단/업데이트(kill switch·강제 업데이트). 순수.
// server가 MIN_APP_VERSION SSOT, 클라가 x-app-version 전송. server 로직 변경 시 구버전 클라가 조용히 깨지는 것 방지.

/** semver(major.minor.patch) 비교 — a<b: -1, a==b: 0, a>b: 1. 잘못된 형식 숫자는 0(관대). */
export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * 클라 버전이 최소 버전 미만이면 업데이트 필요(true=차단).
 * clientVersion 미전송(헤더 없는 레거시)은 통과 — 게이트는 명시적 구버전(< min)만 막는다(헤더 누락 오차단 방지).
 */
export function needsUpdate(clientVersion: string | undefined, minVersion: string): boolean {
  if (!clientVersion) return false;
  return compareVersion(clientVersion, minVersion) < 0;
}
