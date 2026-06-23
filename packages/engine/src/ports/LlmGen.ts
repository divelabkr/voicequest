// 콘텐츠 생성 포트 — 빌드타임 변주 풀 생성(judge LlmPort와 별개, 자유생성 허용).
// 공급자(Anthropic/Qwen 등)는 어댑터 뒤(규칙7). scene-gen은 이 계약만 의존(공급자 모름·교체 가능).
export interface LlmGenPort {
  generate(prompt: string): Promise<string>;
}
