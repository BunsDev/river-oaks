FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/enforce-pnpm.mjs ./scripts/enforce-pnpm.mjs
RUN pnpm install --frozen-lockfile
COPY preview ./preview
# vite.config.js loads the shared-town dev plugin from server/.
COPY server ./server
COPY src/river_oaks/chauffeur-policy.json ./src/river_oaks/chauffeur-policy.json
COPY scripts ./scripts
COPY landing-page ./landing-page
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/preview/src ./preview/src
COPY --from=build /app/preview/public/data ./preview/public/data
COPY server ./server
COPY --from=build /app/src/river_oaks/chauffeur-policy.json ./src/river_oaks/chauffeur-policy.json
RUN mkdir -p /app/.runtime && chown node:node /app/.runtime
USER node
EXPOSE 8787
CMD ["node", "server/start.js"]
