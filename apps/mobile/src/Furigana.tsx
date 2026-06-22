// 후리가나 표시 — 빌드타임 생성된 "学校(がっこう)" okurigana 텍스트를 한자 위 가나로 렌더(RN).
// kuroshiro가 빌드타임에 생성(spike/furigana-gen) → 캐시 → 이 컴포넌트가 표시. 학습 UX 핵심.
import { View, Text, StyleSheet } from "react-native";

type Token = { kanji: string; reading: string } | { plain: string };

function parse(s: string): Token[] {
  const out: Token[] = [];
  const re = /([一-龯々〆ヶ]+)\(([ぁ-んァ-ヶー]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ plain: s.slice(last, m.index) });
    out.push({ kanji: m[1] ?? "", reading: m[2] ?? "" });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ plain: s.slice(last) });
  return out;
}

export default function Furigana({ text, size = 16 }: { text: string; size?: number }) {
  return (
    <View style={st.row}>
      {parse(text).map((t, i) =>
        "kanji" in t ? (
          <View key={i} style={st.ruby}>
            <Text style={[st.rt, { fontSize: Math.round(size * 0.5) }]}>{t.reading}</Text>
            <Text style={{ fontSize: size, color: "#2c2c2a" }}>{t.kanji}</Text>
          </View>
        ) : (
          <Text key={i} style={[st.plain, { fontSize: size }]}>{t.plain}</Text>
        ),
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" },
  ruby: { alignItems: "center" },
  rt: { color: "#888780" },
  plain: { color: "#2c2c2a" },
});
