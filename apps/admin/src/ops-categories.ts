// 운영 콘솔 카테고리 — ops 화면이 렌더하는 6분야 메타(기능·회원·관리·운영·보안·서버).
// status: done(코드 구현됨) | planned(계획). ref=구현 위치(어드민 화면이 딥링크에 활용).
export type OpsStatus = "done" | "planned";
export interface OpsItem {
  label: string;
  status: OpsStatus;
  ref?: string;
}
export interface OpsCategory {
  key: string;
  title: string;
  icon: string; // Tabler 아이콘명
  items: OpsItem[];
}

export const OPS_CATEGORIES: OpsCategory[] = [
  {
    key: "feature",
    title: "기능",
    icon: "puzzle",
    items: [
      { label: "발화트리·판정·난이도사다리", status: "done", ref: "engine: dialogue/judge/opic" },
      { label: "복습·안전NPC·콜백/슬롯", status: "done", ref: "engine: review/safety/callback" },
      { label: "시험역량·계측 신호", status: "done", ref: "engine: readModel/learning" },
      { label: "콘텐츠 공장(대사·이미지·음악)", status: "planned", ref: "cacheBuild + 어댑터" },
    ],
  },
  {
    key: "member",
    title: "회원",
    icon: "users",
    items: [
      { label: "가입·동의·탈퇴 라이프사이클", status: "done", ref: "engine: account / server: /auth,/account" },
      { label: "인원 게이트·웨이팅리스트", status: "done", ref: "engine: access" },
      { label: "초대코드 인증(AuthPort)", status: "done", ref: "engine: invite / server: /admin/invite,/auth/redeem" },
      { label: "유료 전환·구독", status: "planned", ref: "스토어 IAP" },
    ],
  },
  {
    key: "content",
    title: "관리",
    icon: "folder",
    items: [
      { label: "캐시 빌드·매니페스트·dedup", status: "done", ref: "api: cacheBuild / engine: cache" },
      { label: "대사 생성·검수 게이트", status: "planned", ref: "콘텐츠 공장" },
      { label: "에피소드·변주풀 관리", status: "planned" },
      { label: "어드민 UI", status: "planned", ref: "apps/admin" },
    ],
  },
  {
    key: "ops",
    title: "운영",
    icon: "chart-bar",
    items: [
      { label: "배포 단계(alpha/pilot/ga)", status: "done", ref: "engine: access STAGE_LIMITS" },
      { label: "D1 계측·비용 추정", status: "done", ref: "engine: learning / spike: finance-sim" },
      { label: "API 사용량·턴 캡", status: "done", ref: "engine: access canSpendTurn" },
      { label: "게이트 메트릭 자동화", status: "planned" },
    ],
  },
  {
    key: "security",
    title: "보안",
    icon: "lock",
    items: [
      { label: "국외이전 동의 게이트", status: "done", ref: "engine: account canUseVoice" },
      { label: "잊혀질 권리(탈퇴 삭제)·음성폐기", status: "done", ref: "account: withdraw / §6" },
      { label: "rate limit·폭주 방어", status: "done", ref: "access: dailyTurnCap" },
      { label: "키관리(Secret Manager)·SynthID", status: "planned", ref: "§9" },
    ],
  },
  {
    key: "infra",
    title: "서버",
    icon: "server",
    items: [
      { label: "STT 어댑터·HTTP 서버·폴백", status: "done", ref: "stt-deepgram / api: server,session" },
      { label: "Cloud Run·Firestore", status: "planned", ref: "store-firestore 어댑터" },
      { label: "TTS/이미지 캐시 빌드잡", status: "planned", ref: "tts-gemini / cacheBuild" },
      { label: "용량 거버넌스·압축", status: "planned", ref: "§11" },
    ],
  },
];

/** 구현 진행률 — done / 전체 */
export function opsProgress(): { done: number; total: number } {
  const items = OPS_CATEGORIES.flatMap((c) => c.items);
  return { done: items.filter((i) => i.status === "done").length, total: items.length };
}
