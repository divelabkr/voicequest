// 6역량 레이더 — react-native-svg. 색 토큰(theme.ts): 데이터=primary(teal), 격자=line, 라벨=muted.
// 위젯 미리보기(voicequest_result_screen)의 RN 포팅. 운영자 대시보드와 같은 6축 구조.
import Svg, { Polygon, Line, Text as SvgText } from "react-native-svg";
import { T } from "../theme";

const CX = 170;
const CY = 130;
const R = 95;
export const RADAR_LABELS = ["발음", "어휘", "문법", "자연도", "속도", "도전"] as const;

function point(i: number, ratio: number): string {
  const ang = ((-90 + i * 60) * Math.PI) / 180; // 발음(위)부터 시계방향 60°씩
  return `${CX + Math.cos(ang) * R * ratio},${CY + Math.sin(ang) * R * ratio}`;
}

export default function RadarChart({ values }: { values: number[] }) {
  const grid = (r: number): string => RADAR_LABELS.map((_, i) => point(i, r)).join(" ");
  const data = RADAR_LABELS.map((_, i) =>
    point(i, Math.max(0, Math.min(100, values[i] ?? 0)) / 100),
  ).join(" ");

  return (
    <Svg viewBox="0 0 340 252" width="100%" height={200}>
      <Polygon points={grid(1)} fill="none" stroke={T.line} strokeWidth={0.5} />
      <Polygon points={grid(0.5)} fill="none" stroke={T.line} strokeWidth={0.5} />
      {RADAR_LABELS.map((_, i) => {
        const [x, y] = point(i, 1).split(",");
        return <Line key={`ax${i}`} x1={CX} y1={CY} x2={Number(x)} y2={Number(y)} stroke={T.line} strokeWidth={0.5} />;
      })}
      <Polygon points={data} fill={T.primary} fillOpacity={0.18} stroke={T.primary} strokeWidth={1.5} />
      {RADAR_LABELS.map((label, i) => {
        const ang = ((-90 + i * 60) * Math.PI) / 180;
        const lx = CX + Math.cos(ang) * (R + 20);
        const ly = CY + Math.sin(ang) * (R + 20) + 4;
        return (
          <SvgText key={`lb${i}`} x={lx} y={ly} fontSize={12} fill={T.muted} textAnchor="middle">
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
