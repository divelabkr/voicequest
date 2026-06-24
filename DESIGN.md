---
# VoiceQuest 디자인 토큰 — 코딩 에이전트 판독용 명세(google-labs-code/design.md 형식).
# 화면을 추가·수정할 때 이 토큰을 단일 출처로 따른다. 값 직접 하드코딩 금지.
name: VoiceQuest
tagline: "목적이 있는 상황에서 말해야 게임이 열린다"
mood: "따뜻한 라멘집의 온기 + 차분한 학습 신뢰"
colors:
  # Primary — UI 뼈대(차분·신뢰·집중). 토글·사용자 발화 버블·1차 버튼.
  primary:        "#0f6e56"   # teal
  primary-ink:    "#ffffff"
  primary-soft:   "#e4f0eb"   # primary 연한 배경
  # Accent — 온기·행동(라멘집 김, 다이키, 호감도). 마이크·시작하기 CTA·별점.
  accent:         "#d85a30"   # warm orange
  accent-ink:     "#ffffff"
  accent-soft:    "#faece7"
  # Neutral — 크림 베이지 베이스(차가운 순백 회피 → 눈 피로↓·몰입↑).
  paper:          "#faf7f2"   # 전체 배경(절대 #fff 금지)
  card:           "#ffffff"   # paper 위 카드만 순백
  ink:            "#2c2c2a"   # 본문 텍스트
  muted:          "#5f5e5a"   # 보조 텍스트
  hint:           "#888780"   # 힌트·placeholder
  line:           "#e5e0d8"   # 테두리·구분선
  # Semantic — 상태(원색 회피, 베이지와 조화). pill 배지로 사용.
  success:        "#27500a"
  success-bg:     "#eaf3de"
  error:          "#a32d2d"
  error-bg:       "#fcebeb"
  warn:           "#946011"
  warn-bg:        "#f7efdc"
typography:
  font-family:    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', 'Noto Sans JP', sans-serif"
  font-mono:      "ui-monospace, SFMono-Regular, monospace"
  scale:
    display:  { size: 40, weight: 700, line: 1.10 }   # 화면 타이틀(VoiceQuest)
    h1:       { size: 28, weight: 700, line: 1.20 }
    h2:       { size: 20, weight: 700, line: 1.30 }
    body:     { size: 15, weight: 400, line: 1.60 }    # 일본어 가독 위해 1.6
    body-sm:  { size: 13, weight: 400, line: 1.50 }
    label:    { size: 12, weight: 600, line: 1.40, tracking: 0.02 }
spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
radius:  { sm: 8, md: 14, lg: 20, full: 9999 }
elevation:
  card:   "0 1px 3px rgba(44,44,42,0.06)"
  raised: "0 6px 20px rgba(44,44,42,0.12)"
components:
  button-primary: { bg: primary, ink: primary-ink, radius: md, padY: 14, padX: 20, weight: 700 }
  button-accent:  { bg: accent,  ink: accent-ink,  radius: md, padY: 16, padX: 24, weight: 700 }   # 시작하기·CTA
  mic-button:     { bg: accent,  ink: "#ffffff",   radius: full, size: 88, shadow: raised }        # ★음성 게이트 유일 입력 = 시각 무게 1순위
  input:          { bg: card, border: line, radius: md, pad: 14, ink: ink, placeholder: hint }
  toggle:         { on: primary, off: line, radius: full }
  bubble-npc:     { bg: card, ink: ink, radius: lg, pad: 14, border: line }
  bubble-user:    { bg: primary, ink: "#ffffff", radius: lg, pad: 14 }
  star:           { active: accent, inactive: line }
  pill-success:   { bg: success-bg, ink: success, radius: full, padY: 4, padX: 10 }
  pill-error:     { bg: error-bg, ink: error, radius: full, padY: 4, padX: 10 }
  pill-warn:      { bg: warn-bg, ink: warn, radius: full, padY: 4, padX: 10 }
---

# VoiceQuest — Visual Identity

## 브랜드 한 줄
**"목적이 있는 상황에서 말해야 게임이 열린다."** 따뜻한 라멘집의 온기와 차분한 학습 신뢰가 공존하는, 음성 입력 일본어 학습 RPG.

## 색의 의도
- **Primary `teal #0f6e56`** — UI의 뼈대. 차분·신뢰·집중(학습 도구의 침착함). 토글, 사용자 발화 버블, 1차 버튼.
- **Accent `warm orange #d85a30`** — 온기와 행동. 라멘집의 김, 다이키의 친근함, 호감도. **마이크 버튼**(음성 게이트의 유일한 입구라 가장 따뜻하고 커야 함), 시작하기 CTA, 결과 별점.
- **Neutral `베이지 #faf7f2 → #2c2c2a`** — 크림빛 종이 질감. 차가운 순백(#fff)은 카드에만, 전체 배경은 절대 금지 — 눈의 피로를 줄이고 몰입을 높인다.
- **Semantic** — 성공(올리브 `#27500a`), 오류(벽돌 `#a32d2d`), 주의(앰버 `#946011`). 원색을 피해 베이지와 조화. 항상 연한 배경 + 진한 텍스트의 **pill 배지**로.

## 철칙 (코딩 에이전트는 반드시 준수)
1. **마이크 버튼 = accent + full radius + 88px**, 항상 화면에서 가장 큰 터치 타깃. 음성 게이트의 유일한 입구이므로 시각 무게 1순위(CLAUDE.md §0).
2. **전체 배경은 `paper`, 카드만 `card(#fff)`.** 순백 배경 금지.
3. **타이포는 한글·일본어 혼용 전제** — Noto Sans KR/JP 폴백 필수, 일본어 본문 line-height ≥ 1.6.
4. **명도비 WCAG AA(4.5:1)** — ink/paper·primary-ink/primary·accent-ink/accent 모두 충족.
5. **상태는 pill로 일관** — 운영 콘솔·결과 인사이트 어디서나 같은 success/error/warn 배지.

## 화면별 적용
- **가입(Signup)**: paper 배경 · card 입력폼 · accent "시작하기" 버튼 · primary 동의 토글.
- **대화(Talk)**: paper 배경 · NPC 버블(card+line) · 사용자 버블(primary) · **마이크 버튼(accent, 하단 중앙, 88px)**.
- **결과(Result)**: accent 별점 · 6축 인사이트는 semantic pill.
- **운영 콘솔(admin)**: card 그리드 · 상태 pill · primary 탭.
