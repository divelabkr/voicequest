// 엔진 공개 진입점 (barrel)
export * from "./types";
export { judge, JUDGE_RULES } from "./judge";
export { parseEpisode, findScene, resolveEnding, sceneToPrompt } from "./episode";
export {
  startCursor,
  currentBeat,
  nextCursor,
  awaitsUser,
  ignoresUser,
  isSceneEnd,
} from "./dialogue";
export type { BeatCursor } from "./dialogue";
export { initState, advance } from "./stateMachine";
export type { GameState, AdvanceResult } from "./stateMachine";
export { recoveryStep, recoveryGuide } from "./recovery";
export type { RecoveryStep } from "./recovery";
export { adjustStrictness, recommendLevel, JLPT_LADDER } from "./opic";
export { deflectionTone, affinityPenalty, isHardBlock, needsDeflection } from "./safety";
export type { DeflectionTone } from "./safety";
export { buildReadModel } from "./readModel";
export { sceneStats, type SceneStat } from "./content-stats";
export { emptyQuality, recordQuality, summarizeQuality, type QualityMeter, type QualitySummary } from "./quality";
export { timeToFirstWin, dropPoint, churnRisk } from "./learning";
export { scoreToStars, branchUp, worldlineId } from "./review";
export { pickCallback, fillSlots } from "./callback";
export { signup, canUseVoice, withdraw } from "./account";
export type { Account, AccountStatus, ConsentFlags } from "./account";
export { issueInvite, redeemInvite, revokeInvite } from "./invite";
export type { InviteCode, InviteStatus, RedeemResult } from "./invite";
export type { AuthPort } from "./ports/Auth";
export { SRS_INTERVALS_DAYS, dayOf, todaysCards, reviewCard, completeToday, makeCard } from "./daily";
export type { DailyCard, DailyState } from "./daily";
export { VOICE_CANDIDATES, DEFAULT_PRESETS } from "./voice";
export type { VoicePreset } from "./voice";
export { PILOT_GATE, evaluateGate } from "./releaseGate";
export type { GateCriterion, GateKind, GateInput, GateReport } from "./releaseGate";
export { validateGeneratedScene, EXPR_BANDS } from "./sceneGuard";
export type { GuardReport, GuardFlag, GuardLevel, GuardContext } from "./sceneGuard";
export { UNIT_COST, DEFAULT_BUDGET, emptyMeter, rollMonth, recordCall, checkBudget } from "./budget";
export type { CostKind, CostMeter, BudgetConfig, BudgetStatus } from "./budget";
export { VOICE_RAW_TTL_DAYS, REVIEW_RECORDING_TTL_DAYS, isExpired, expiredKeys, PURGE_ON_WITHDRAW } from "./retention";
export { canStart, spend, recharge } from "./energy";
export type { EnergyState } from "./energy";
export type { LlmPort } from "./ports/Llm";
export type { SttPort, Transcript, SttStreamPort, SttStream, StreamTranscript } from "./ports/Stt";
export type { TtsPort } from "./ports/Tts";
export type { EventStorePort } from "./ports/EventStore";
export type { ImagePort, ImageSpec, VisualAsset } from "./ports/Image";
export type { MusicPort, MusicSpec, AudioAsset } from "./ports/Music";
export { buildManifest, assetHash, EPISODE_BYTE_BUDGET } from "./cache";
export type { CacheEntry, CacheManifest, CacheKind } from "./cache";
export { STAGE_LIMITS, admit, canSpendTurn, recordTurn, openSlots } from "./access";
export type {
  ReleaseStage,
  MemberStatus,
  StageLimits,
  UsageState,
  AdmissionResult,
} from "./access";
export type { AdminPort, AdminSnapshot } from "./ports/Admin";
