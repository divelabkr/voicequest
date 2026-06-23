// 콘텐츠 공장 배치 — 변주 풀(20~30개 대사)을 Anthropic Batch API로 한 번에 생성(비용 50%↓).
// 현재 judge·scene-gen이 무료 Qwen이라 미사용. Anthropic 유료 콘텐츠 생성·스케일 시 진입점.
// 규칙4: 골격 고정·표면 변주만. 규칙: 런타임 자유생성 X — 빌드타임 변주 풀 생성 전용.

export interface BatchRequest {
  customId: string; // 결과 매핑 키(씬·변주 인덱스)
  prompt: string; // 변주 생성 프롬프트(가이드 안에서)
}

/** 배치 요청 본문 빌더 — 순수(네트워크 분리, 테스트·재사용). */
export function buildBatchBody(requests: BatchRequest[], model = "claude-haiku-4-5"): { requests: unknown[] } {
  return {
    requests: requests.map((q) => ({
      custom_id: q.customId,
      params: { model, max_tokens: 900, messages: [{ role: "user", content: q.prompt }] },
    })),
  };
}

/**
 * Anthropic Batch 생성 — 여러 변주 프롬프트를 한 배치로(50% 할인). 반환 batch_id.
 * 폴링/결과 수집은 스케일 구현(GET /v1/messages/batches/{id} → results, 24h 내 완료).
 */
export async function createGenBatch(requests: BatchRequest[], apiKey: string, model = "claude-haiku-4-5"): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(buildBatchBody(requests, model)),
  });
  if (!r.ok) throw new Error(`batch_${r.status}: ${(await r.text()).slice(0, 120)}`);
  return ((await r.json()) as { id?: string }).id ?? "";
}
