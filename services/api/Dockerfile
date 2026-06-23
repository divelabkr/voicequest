# VoiceQuest API — 단일 서비스(API + /admin 콘솔 + / 웹 정적).
# tsx 런타임: 패키지가 src/index.ts를 직접 export(dist 빌드 없음) → 별도 build 단계 불필요.
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
# monorepo 루트를 통째로 COPY(dockerContext: .) — content/·content_cache/도 서버가 런타임에 읽음.
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
# Render는 PORT를 주입(server.ts:529가 process.env.PORT 대응). EXPOSE는 문서용.
EXPOSE 8787
CMD ["pnpm", "-C", "services/api", "exec", "tsx", "src/server.ts"]
