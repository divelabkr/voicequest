// VoiceQuest 사업화 재무 시뮬레이션 — 단위경제 + 연간 P&L + 시나리오.
// 입력 근거(메모리): 가격 1.4~1.9만/월+감정축 IAP, 리텐션 D30~2%, otome ARPU $16.5,
//   레드팀 로디드 CAC $174·LTV $42~59=LTV/CAC≈0.3. 측정: 생성 빌드타임 $1/ep, 런타임 STT+judge.
// ⚠️ 가정 기반 — 전환율·CAC·리텐션은 킬테스트 미검증. 숫자는 방향성이지 예측 아님. 착수 시 실측.
// 실행: pnpm --filter @voicequest/spike exec tsx finance-sim.ts

const KRW = 1350; // $1

// ── 런타임 COGS (유저당 월) — 측정 기반 ──
const c = { judgePerTurn: 0.001, sttPerTurn: 0.0006, turns: 10, sessionsPerMo: 12 };
const runtimeMonthly = (c.judgePerTurn + c.sttPerTurn) * c.turns * c.sessionsPerMo;
const GROSS_MARGIN = 0.85; // COGS 낮아 마진 높음

// ── 시나리오 (유료유저 기준) ──
interface S {
  name: string;
  subKRW: number; // 월 구독
  iapMo: number; // 유료유저 월 IAP($)
  lifeMo: number; // 평균 유료 수명(개월) — 리텐션 함수
  cacPaid: number; // 유료유저 1명 로디드 획득비($)
  conv: number; // 다운로드→유료 전환
}
const scenarios: S[] = [
  { name: "보수(레드팀)", subKRW: 14000, iapMo: 3, lifeMo: 3, cacPaid: 174, conv: 0.02 },
  { name: "기본(오가닉)", subKRW: 16000, iapMo: 6, lifeMo: 6, cacPaid: 40, conv: 0.035 },
  { name: "낙관(덕질바이럴)", subKRW: 19000, iapMo: 12, lifeMo: 10, cacPaid: 30, conv: 0.05 },
];

// ── 고정비(연) — 소규모 팀 + 콘텐츠(레드팀: 진짜 병목) ──
const FIXED = { team: 250_000, content: 60_000, infra: 8_000 }; // 개발3명+콘텐츠외주+인프라
const fixedYear = FIXED.team + FIXED.content + FIXED.infra;

function unit(s: S) {
  const arppu = s.subKRW / KRW + s.iapMo; // 유료유저 월매출
  const ltv = arppu * s.lifeMo * GROSS_MARGIN;
  const ltvCac = ltv / s.cacPaid;
  const margPerPaid = ltv - s.cacPaid; // 유료 1인 기여(생애)
  return { arppu, ltv, ltvCac, margPerPaid };
}

const won = (usd: number) => `₩${Math.round((usd * KRW) / 1000)}K`;

console.log("💹 VoiceQuest 재무 시뮬레이션 — 가정 기반(킬테스트 미검증, 방향성)\n");

console.log(`[런타임 COGS] 유저당 월 $${runtimeMonthly.toFixed(2)} (구독의 ~${((runtimeMonthly / (15000 / KRW)) * 100).toFixed(1)}%) → 무시 수준`);
console.log(`[생성비] 에피소드당 빌드타임 ~$1 일회성 / 런타임 $0\n`);

console.log("[단위경제] 유료유저 1명 기준");
console.log("시나리오            ARPPU/월   LTV     CAC      LTV/CAC   판정");
for (const s of scenarios) {
  const u = unit(s);
  const verdict = u.ltvCac >= 3 ? "✅ 우수" : u.ltvCac >= 1 ? "⚠️ 빠듯" : "❌ 적자";
  console.log(
    `${s.name.padEnd(18)} $${u.arppu.toFixed(1).padStart(5)}   $${u.ltv.toFixed(0).padStart(4)}   $${String(s.cacPaid).padStart(4)}    ${u.ltvCac.toFixed(2).padStart(5)}    ${verdict}`,
  );
}

console.log("\n[손익분기] 영업흑자에 필요한 누적 유료유저 수 (고정비 $" + (fixedYear / 1000).toFixed(0) + "K/년)");
for (const s of scenarios) {
  const u = unit(s);
  if (u.margPerPaid <= 0) {
    console.log(`${s.name.padEnd(18)} 불가 — LTV<CAC(유료마다 $${(-u.margPerPaid).toFixed(0)} 손실)`);
  } else {
    const be = Math.ceil(fixedYear / u.margPerPaid);
    console.log(`${s.name.padEnd(18)} ${be.toLocaleString()}명 (유료 1인 기여 $${u.margPerPaid.toFixed(0)})`);
  }
}

console.log("\n[연간 P&L] 신규 유료 1만명 코호트 가정");
const COHORT = 10_000;
for (const s of scenarios) {
  const u = unit(s);
  const rev = COHORT * u.ltv;
  const mkt = COHORT * s.cacPaid;
  const cogs = rev * (1 - GROSS_MARGIN);
  const op = rev - mkt - cogs - fixedYear;
  console.log(
    `${s.name.padEnd(18)} 매출 ${won(rev)} − 마케팅 ${won(mkt)} − COGS ${won(cogs)} − 고정 ${won(fixedYear)} = ${op >= 0 ? "흑자" : "적자"} ${won(Math.abs(op))}`,
  );
}

console.log("\n[핵심 인사이트]");
console.log("- COGS·생성비는 무시 수준 → 기술 단가는 사업 리스크 아님(캐시 우선의 승리)");
console.log("- 생사 변수 = CAC(오가닉 채널)와 lifeMo(리텐션). 둘 다 미검증 가정");
console.log("- 보수=적자(레드팀 LTV/CAC≈0.3 재확인). 페이드로 사면 구조적 손실");
console.log("- 흑자 조건: 덕질 오가닉으로 CAC ↓ + 감정축으로 lifeMo·IAP ↑ 동시 달성");
console.log("- 숨은 고정비 = 콘텐츠 제작(레드팀 1순위 병목). 작가도구로 단가 못 낮추면 스케일 불가");
