FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

WORKDIR /app

FROM base AS workspace-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/webapp/package.json apps/webapp/package.json
COPY apps/project-assistant-service/package.json apps/project-assistant-service/package.json
COPY packages/stream-core/package.json packages/stream-core/package.json

RUN pnpm install --frozen-lockfile

FROM workspace-deps AS workspace-builder

COPY . .

RUN pnpm --filter @ai-mind/stream-core build
RUN pnpm --dir apps/project-assistant-service build
RUN pnpm --dir apps/webapp build
# 将 next.config.ts 预编译为纯 JS/.mjs，避免生产容器运行期动态安装 TypeScript
RUN node -e "const ts=require('typescript');const src=require('fs').readFileSync('apps/webapp/next.config.ts','utf8');const r=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}});require('fs').writeFileSync('apps/webapp/next.config.mjs',r.outputText)"

FROM base AS workspace-production-deps

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/webapp/package.json apps/webapp/package.json
COPY apps/project-assistant-service/package.json apps/project-assistant-service/package.json
COPY packages/stream-core/package.json packages/stream-core/package.json

RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS webapp-runner

ARG OCI_CREATED="unknown"
ARG OCI_REVISION="local"
ARG OCI_SOURCE="https://github.com/unknown/ai-mind"
ARG OCI_VERSION="0.2.2-dev"

LABEL org.opencontainers.image.created="${OCI_CREATED}"
LABEL org.opencontainers.image.description="AI Mind webapp"
LABEL org.opencontainers.image.revision="${OCI_REVISION}"
LABEL org.opencontainers.image.source="${OCI_SOURCE}"
LABEL org.opencontainers.image.title="ai-mind-webapp"
LABEL org.opencontainers.image.version="${OCI_VERSION}"

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=workspace-production-deps --chown=node:node /app/package.json /app/package.json
COPY --from=workspace-production-deps --chown=node:node /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=workspace-production-deps --chown=node:node /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=workspace-production-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=workspace-production-deps --chown=node:node /app/apps/webapp/node_modules /app/apps/webapp/node_modules

COPY --from=workspace-builder --chown=node:node /app/apps/webapp/.next /app/apps/webapp/.next
COPY --from=workspace-builder --chown=node:node /app/apps/webapp/public /app/apps/webapp/public
COPY --from=workspace-builder --chown=node:node /app/apps/webapp/package.json /app/apps/webapp/package.json
COPY --from=workspace-builder --chown=node:node /app/apps/webapp/next.config.mjs /app/apps/webapp/next.config.mjs
COPY --from=workspace-builder --chown=node:node /app/apps/webapp/lib/ai/mcp/servers /app/apps/webapp/lib/ai/mcp/servers
COPY --from=workspace-builder --chown=node:node /app/packages/stream-core/package.json /app/packages/stream-core/package.json
COPY --from=workspace-builder --chown=node:node /app/packages/stream-core/build /app/packages/stream-core/build
COPY --from=workspace-builder --chown=node:node /app/docs /app/docs
COPY --from=workspace-builder --chown=node:node /app/assets/local-prompt /app/assets/local-prompt

USER node
WORKDIR /app/apps/webapp

CMD ["node", "node_modules/next/dist/bin/next", "start"]

FROM base AS project-assistant-service-runner

ARG OCI_CREATED="unknown"
ARG OCI_REVISION="local"
ARG OCI_SOURCE="https://github.com/unknown/ai-mind"
ARG OCI_VERSION="0.2.2-dev"

LABEL org.opencontainers.image.created="${OCI_CREATED}"
LABEL org.opencontainers.image.description="AI Mind project assistant service"
LABEL org.opencontainers.image.revision="${OCI_REVISION}"
LABEL org.opencontainers.image.source="${OCI_SOURCE}"
LABEL org.opencontainers.image.title="ai-mind-project-assistant-service"
LABEL org.opencontainers.image.version="${OCI_VERSION}"

ENV NODE_ENV=production
ENV PROJECT_ASSISTANT_SERVICE_HOST=0.0.0.0
ENV PROJECT_ASSISTANT_SERVICE_PORT=8788

WORKDIR /app

COPY --from=workspace-production-deps --chown=node:node /app/package.json /app/package.json
COPY --from=workspace-production-deps --chown=node:node /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=workspace-production-deps --chown=node:node /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=workspace-production-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=workspace-production-deps --chown=node:node /app/apps/project-assistant-service/node_modules /app/apps/project-assistant-service/node_modules

COPY --from=workspace-builder --chown=node:node /app/apps/project-assistant-service/dist /app/apps/project-assistant-service/dist
COPY --from=workspace-builder --chown=node:node /app/apps/project-assistant-service/package.json /app/apps/project-assistant-service/package.json

USER node
WORKDIR /app/apps/project-assistant-service

CMD ["node", "dist/main.js"]
