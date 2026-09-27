FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY preview ./preview
# vite.config.js loads the shared-town dev plugin from server/.
COPY server ./server
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/preview/src ./preview/src
COPY --from=build /app/preview/public/data ./preview/public/data
COPY server ./server
RUN mkdir -p /app/.runtime && chown node:node /app/.runtime
USER node
EXPOSE 8787
CMD ["node", "server/start.js"]
