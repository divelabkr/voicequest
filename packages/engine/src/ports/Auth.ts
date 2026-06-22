// 인증 포트 — 인증 메커니즘을 추상화한다. MVP=초대코드, 런칭=소셜/매직링크로 어댑터만 교체.
// account.ts 라이프사이클(가입동의→사용→탈퇴)은 이 포트에 의존하지 않는다 —
// verify가 userId만 돌려주면 되므로, 인증 방식이 바뀌어도 라이프사이클 코드는 불변이다.
export interface AuthPort {
  /** credential(초대코드/소셜토큰 등)을 검증해 userId를 반환. 실패 시 null. */
  verify(credential: string): Promise<string | null>;
}
