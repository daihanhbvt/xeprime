# syntax=docker/dockerfile:1.7
#
# BỐN image cho BỐN vai trò, dựng từ MỘT lần build:
#
#   web     Next.js `standalone` — chỉ các file server cần lúc chạy (Next tự dò)
#   api     NestJS + dependency PRODUCTION của api (`pnpm deploy --prod`)
#   worker  tiến trình nền + dependency PRODUCTION của worker
#   tools   Prisma CLI + tsx cho `migrate` / `seed` — chạy một lượt lúc deploy rồi thoát
#
# Vì sao tách (đổi 30/10/2026, trước đó là MỘT image ~3GB cho cả bốn): image chung chở nguyên cây
# node_modules của workspace (~1,8GB) — trình biên dịch Next/SWC, turbo, typescript, prettier,
# Prisma Studio, firebase-tools — vào MỌI container đang nhận request từ Internet. Tách theo vai
# trò thì container chỉ có đúng thứ nó chạy, mỗi bản phát hành nhẹ khoảng một nửa (bốn image dùng
# chung lớp nền, Docker lưu lớp đó MỘT lần), và Prisma CLI — công cụ ghi schema database — không
# còn nằm trong tiến trình api.
#
# Cái giá: cây phụ thuộc của từng image là cây ĐÃ CẮT (standalone / `pnpm deploy`). Thiếu một file
# lúc chạy chỉ lộ ra khi container khởi động — vì thế CI chạy thử cả bốn image trên một database
# thật trước khi cho deploy (`.github/workflows/ci.yml`, job "Build image").
#
# Build (từ GỐC REPO) — định nghĩa duy nhất ở `deploy/docker-bake.hcl`:
#   docker buildx bake -f deploy/docker-bake.hcl
# Các giá trị `NEXT_PUBLIC_*` bị Next NHÚNG CỨNG vào bundle lúc build, nên chúng là --build-arg
# chứ không phải biến runtime. Đổi tên miền = build lại web.

# Thư mục trong `node_modules/.pnpm` chỉ Prisma CLI cần — gỡ khỏi api/worker (giải thích ở stage
# `api-deps`). ARG dùng chung nhiều stage phải khai TRƯỚC `FROM` đầu tiên.
ARG PRISMA_CLI_ONLY="prisma@* @prisma+studio-core@* @prisma+dev@* @prisma+config@* @prisma+engines@* @electric-sql+* effect@* typescript@*"

# ---------------------------------------------------------------------------
# base — nền chung cho mọi stage (và là lớp chung của bốn image)
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base

# TZ khớp CI (`.github/workflows/ci.yml`): sản phẩm chỉ có MỘT múi giờ và nó là giờ Việt Nam
# (CLAUDE.md §9). Dữ liệu vẫn lưu UTC — đây là múi giờ của TIẾN TRÌNH, và nó là thứ giữ cho
# ~20 chỗ còn diễn giải input theo giờ máy (nợ đã ghi ở completion-roadmap) chạy đúng.
# Container `db` thì ngược lại: TZ=UTC, đặt trong docker-compose.prod.yml.
ENV TZ=Asia/Ho_Chi_Minh \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    # husky cài git hook lúc `pnpm install`; image không có `.git` nên bước đó vô nghĩa.
    HUSKY=0 \
    CI=1

# `curl` cho healthcheck của compose; `openssl` cho Prisma.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl curl tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

# ---------------------------------------------------------------------------
# manifests — lockfile + mọi package.json, KHÔNG có mã nguồn. Gốc chung của mọi lượt cài
# (layer này chỉ vỡ cache khi package.json/lockfile đổi)
# ---------------------------------------------------------------------------
FROM base AS manifests

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Liệt kê TỪNG manifest thay vì `COPY . .`: mục đích của stage này là cache. Copy cả source
# vào đây thì mỗi lần sửa một dòng TSX là cài lại toàn bộ dependency (~5–8 phút trên E5 v4).
#
# Ba manifest `apps/mobile/*` phải có mặt dù app native KHÔNG được cài (xem --filter bên dưới):
# `--frozen-lockfile` đối chiếu lockfile với TOÀN BỘ importer, thiếu một manifest là fail.
# Từ 25/09/2026 `apps/mobile` chỉ là cái vỏ chứa ba package (customer · manage · shared) và
# KHÔNG còn package.json của riêng nó — thêm/bớt một package mobile là sửa danh sách này.
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mobile/customer/package.json ./apps/mobile/customer/
COPY apps/mobile/manage/package.json ./apps/mobile/manage/
COPY apps/mobile/shared/package.json ./apps/mobile/shared/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/config/package.json ./packages/config/
COPY packages/domain/package.json ./packages/domain/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validators/package.json ./packages/validators/
COPY prisma/package.json ./prisma/

# ---------------------------------------------------------------------------
# deps — cây ĐẦY ĐỦ (có devDependencies) để build
# ---------------------------------------------------------------------------
FROM manifests AS deps

# `--filter "<pkg>..."` = package đó + mọi thứ nó phụ thuộc. Bốn filter này phủ hết cây build
# và CỐ Ý bỏ ba package `@xeprime/mobile-*`: Expo + React Native là ~1GB không có việc gì trên
# server web.
#
# `.npmrc` của repo đặt `network-concurrency=4` cho mạng dev chậm; VPS thì không, nên ghi đè.
RUN --mount=type=cache,id=xeprime-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --store-dir /pnpm/store \
      --network-concurrency 16 \
      --filter "@xeprime/api..." \
      --filter "@xeprime/web..." \
      --filter "@xeprime/worker..." \
      --filter "@xeprime/prisma..."

# ---------------------------------------------------------------------------
# builder — sinh Prisma Client, build 6 package dùng chung, api, web, worker
# ---------------------------------------------------------------------------
FROM deps AS builder

# Máy chủ production không có việc gì phải báo cáo số liệu build ra ngoài.
ENV NEXT_TELEMETRY_DISABLED=1

# Giá trị Next NHÚNG CỨNG vào bundle client. Chúng KHÔNG phải bí mật (ai xem trang cũng đọc
# được), nên nằm ở --build-arg là đúng chỗ.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME=XePrime
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
ARG NEXT_PUBLIC_FIREBASE_APP_ID=
# BA SITE trong một Next app (ADR 0051): URL gốc của từng site + chế độ định tuyến. `host` ở
# staging/production (mỗi khu một host, `proxy.ts` rewrite theo host); thiếu biến thì app rơi về
# `path` (máy dev) — một image build thiếu ba URL này sẽ dựng link khác site thành đường dẫn tương
# đối trên sai host, nên bước kiểm dưới chặn ngay.
ARG NEXT_PUBLIC_XP_ZONE_MODE=host
ARG NEXT_PUBLIC_WEB_MARKET_URL=
ARG NEXT_PUBLIC_WEB_PARTNER_URL=
ARG NEXT_PUBLIC_WEB_ADMIN_URL=
# Đai an toàn, KHÔNG phải thứ quyết định hành vi: `proxy.ts` đọc `SESSION_COOKIE_NAME` lúc CHẠY
# (đo trực tiếp — Next 16 chỉ nhúng cứng `NEXT_PUBLIC_*`), nên giá trị thật đến từ
# `environment:` của service `web` trong docker-compose.prod.yml. Giữ ARG ở đây để `.env` trong
# image mô tả đúng cấu hình đã build, và để không gãy nếu một bản Next sau này quay lại nhúng
# cứng biến đó.
ARG SESSION_COOKIE_NAME=xp_session

RUN test -n "$NEXT_PUBLIC_API_URL" \
    || (echo 'NEXT_PUBLIC_API_URL là bắt buộc: trình duyệt gọi API bằng chính giá trị này.' && exit 1)
RUN if [ "$NEXT_PUBLIC_XP_ZONE_MODE" = "host" ]; then \
      test -n "$NEXT_PUBLIC_WEB_MARKET_URL" -a -n "$NEXT_PUBLIC_WEB_PARTNER_URL" -a -n "$NEXT_PUBLIC_WEB_ADMIN_URL" \
      || (echo 'Chế độ host cần đủ NEXT_PUBLIC_WEB_MARKET_URL / _PARTNER_URL / _ADMIN_URL (ADR 0051).' && exit 1); \
    fi

COPY . .

# Mọi script của repo chạy qua `dotenv -e ../../.env`, nên file này phải tồn tại lúc build.
# CHỈ chứa giá trị công khai — DATABASE_URL, secret phiên, khoá SMTP/eSMS đi vào lúc CHẠY qua
# `env_file` của compose. File này ở lại trong stage builder, không đi vào image nào.
RUN printf '%s\n' \
      "NODE_ENV=production" \
      "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" \
      "NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME" \
      "NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY" \
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID" \
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" \
      "NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID" \
      "NEXT_PUBLIC_XP_ZONE_MODE=$NEXT_PUBLIC_XP_ZONE_MODE" \
      "NEXT_PUBLIC_WEB_MARKET_URL=$NEXT_PUBLIC_WEB_MARKET_URL" \
      "NEXT_PUBLIC_WEB_PARTNER_URL=$NEXT_PUBLIC_WEB_PARTNER_URL" \
      "NEXT_PUBLIC_WEB_ADMIN_URL=$NEXT_PUBLIC_WEB_ADMIN_URL" \
      "SESSION_COOKIE_NAME=$SESSION_COOKIE_NAME" \
      > .env

# Đai an toàn thứ hai cho cùng một cái bẫy mà `.dockerignore` đã chặn (đọc ghi chú
# `**/*.tsbuildinfo` ở đó): `incremental: true` + một `.tsbuildinfo` lọt vào context = tsc emit
# 0 file, thoát 0, và package phía sau chết vì "Cannot find module". Ở đây build luôn bắt đầu
# từ trạng thái sạch, không phụ thuộc vào việc máy dev có gọn hay không.
RUN find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete

# Thứ tự BẮT BUỘC: `dist/` bị gitignore và mọi package dùng chung resolve về đó
# (`main: ./dist/index.js`). Bỏ bước này thì api/web chết vì module-not-found, không phải vì
# nghiệp vụ sai (cùng lý do với bước tương ứng trong CI).
# `prisma generate` chạy Ở ĐÂY, trong Linux, nên query engine tải về đúng nền tảng — không
# phải bản Windows của máy dev.
RUN pnpm --filter @xeprime/prisma --filter "./packages/*" -r build

RUN pnpm --filter @xeprime/api build

# `next build` là đỉnh RAM của cả quy trình. Trên VPS 6GB nó vừa đủ NẾU có swap (xem
# deploy/scripts/vps-bootstrap.sh); giới hạn heap ở đây để V8 chủ động GC thay vì để OOM
# killer bắn tiến trình build.
RUN NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @xeprime/web build

RUN pnpm --filter @xeprime/worker build

# --- Gom đầu ra cho từng image vào /out ------------------------------------
#
# web: `output: 'standalone'` (apps/web/next.config.ts) dò từ GỐC REPO, nên server nằm ở
# `standalone/apps/web/server.js`. Next CỐ Ý không chép `public/` và `.next/static/` vào đó
# (giả định chúng đi CDN) — thiếu hai thư mục này là trang lên nhưng không có CSS/JS/logo.
RUN mkdir -p /out \
    && cp -a apps/web/.next/standalone /out/web \
    && cp -a apps/web/public /out/web/apps/web/public \
    && cp -a apps/web/.next/static /out/web/apps/web/.next/static

# ---------------------------------------------------------------------------
# api-deps · worker-deps · tools-deps — node_modules RIÊNG của từng vai trò
# ---------------------------------------------------------------------------
#
# Cài lại từ CÙNG lockfile với `--frozen-lockfile`, chỉ lấy cây của đúng app đó: phiên bản thư
# viện trong image là đúng phiên bản CI đã test. (Không dùng `pnpm deploy`: bản `--legacy` giải
# lại toàn bộ cây từ registry, bỏ qua lockfile; bản mới bắt bật `inject-workspace-packages` cho
# cả workspace, tức là máy dev mất symlink giữa các package.)
#
# `--prod` bỏ devDependencies của app, của các `@xeprime/*` nó dùng và của package gốc workspace
# (eslint, playwright, turbo…). Store dùng chung cache mount với `deps` nên không tải lại gì.
#
# `prepare` của package gốc là `husky` — devDependency của gốc, không có trong các cây này, nhưng
# pnpm vẫn chạy lifecycle của gốc và chết vì "husky: not found". Gỡ đúng script đó ở bản sao
# package.json của stage này; lockfile không đọc `scripts` nên `--frozen-lockfile` không đổi gì.
FROM manifests AS runtime-manifests
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"

#
# Gỡ Prisma CLI khỏi cây production: `@prisma/client` khai CLI và `typescript` là peer TUỲ CHỌN,
# và vì workspace có CLI nên lockfile ghi chúng thành optionalDependency — `--prod` vẫn kéo vào
# (~200MB: studio, pglite, effect, engines). Lúc chạy không gì cần chúng: client đã sinh sẵn ở
# `prisma/generated` và nói chuyện với Postgres qua driver adapter `pg`, không qua engine. Không
# dùng `--no-optional` được — nó bỏ luôn binary Linux của `sharp`. Mọi gói dưới đây chỉ tới được
# qua CLI (đo bằng `pnpm why` 30/10/2026); xoá xong thì dọn symlink treo. Smoke test của CI chạy
# api/worker thật trên cây đã gỡ. Danh sách: `PRISMA_CLI_ONLY` ở đầu file.

FROM runtime-manifests AS api-deps
ARG PRISMA_CLI_ONLY
RUN --mount=type=cache,id=xeprime-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store --network-concurrency 16 \
      --filter "@xeprime/api..." \
    && (cd node_modules/.pnpm && rm -rf $PRISMA_CLI_ONLY) \
    && find /app -xtype l -delete

FROM runtime-manifests AS worker-deps
ARG PRISMA_CLI_ONLY
RUN --mount=type=cache,id=xeprime-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store --network-concurrency 16 \
      --filter "@xeprime/worker..." \
    && (cd node_modules/.pnpm && rm -rf $PRISMA_CLI_ONLY) \
    && find /app -xtype l -delete

# tools CÓ devDependencies: Prisma CLI và tsx là devDependency của `@xeprime/prisma`, và chính
# chúng là lý do image này tồn tại. Không có `--prod` thì pnpm cài cả devDependencies của package
# gốc (turbo, firebase…) — chấp nhận: image này chỉ chạy một lượt lúc deploy rồi thoát, không
# nhận request nào; cắt nó cần đổi lockfile của máy dev.
FROM runtime-manifests AS tools-deps
RUN --mount=type=cache,id=xeprime-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --network-concurrency 16 \
      --filter "@xeprime/prisma..."

# ---------------------------------------------------------------------------
# runtime — nền của bốn image cuối
# ---------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production

# `node` là user có sẵn (uid 1000) trong image chính thức. Chạy production bằng root là thói
# quen xấu không có lý do gì để giữ.
USER node

# Không có CMD mặc định ở bất kỳ image nào: mỗi service trong docker-compose.prod.yml khai lệnh
# của chính nó. Một CMD mặc định ở đây chỉ tạo ảo giác "chạy được luôn".

# ---------------------------------------------------------------------------
# web — `node apps/web/server.js`, cwd /app/apps/web
# ---------------------------------------------------------------------------
FROM runtime AS web
# Server standalone nghe theo HOSTNAME. Docker đặt HOSTNAME = id container, và Next sẽ chỉ nghe
# trên địa chỉ đó — healthcheck gọi 127.0.0.1 thì bị từ chối. Đặt cứng 0.0.0.0.
ENV PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# `.next/cache` (ảnh đã tối ưu) được ghi lúc chạy nên thư mục phải thuộc user `node`.
COPY --from=builder --chown=node:node /out/web /app
WORKDIR /app/apps/web

# ---------------------------------------------------------------------------
# api · worker — node_modules production + `dist` đã build của app và của các `@xeprime/*` nó
# dùng (domain · prisma · types). Package dùng chung resolve về `dist/` (`main: ./dist/index.js`);
# thêm một `@xeprime/*` mới vào dependency của api/worker là phải thêm dòng COPY tương ứng ở đây
# — smoke test của CI (deploy/scripts/smoke-images.sh) bắt chỗ quên.
# ---------------------------------------------------------------------------
FROM runtime AS shared-dist
COPY --from=builder --chown=node:node /app/packages/types/dist /app/packages/types/dist
COPY --from=builder --chown=node:node /app/packages/domain/dist /app/packages/domain/dist
# JSON i18n mà api `import` lúc chạy (`modules/email/plan-guide-email.ts`) — nằm ngoài `dist`.
COPY --from=builder --chown=node:node /app/packages/domain/messages /app/packages/domain/messages
COPY --from=builder --chown=node:node /app/prisma/dist /app/prisma/dist
COPY --from=builder --chown=node:node /app/prisma/generated /app/prisma/generated

# `node dist/main.js`, cwd /app/apps/api
FROM runtime AS api
COPY --from=api-deps --chown=node:node /app /app
COPY --from=shared-dist /app /app
COPY --from=builder --chown=node:node /app/apps/api/dist /app/apps/api/dist
WORKDIR /app/apps/api

# `node dist/main.js`, cwd /app/apps/worker
FROM runtime AS worker
COPY --from=worker-deps --chown=node:node /app /app
COPY --from=shared-dist /app /app
COPY --from=builder --chown=node:node /app/apps/worker/dist /app/apps/worker/dist
WORKDIR /app/apps/worker

# ---------------------------------------------------------------------------
# tools — migrate/seed, cwd /app/prisma (cùng đường dẫn với image chung trước đây, nên lệnh
# seed trong docs/deployment.md giữ nguyên). Seed chạy bằng tsx TỪ MÃ NGUỒN, nên cần đủ
# schema, migration, `src`, `data` và chuỗi `extends` của tsconfig
# (`../packages/config/tsconfig/lib.json` — thiếu là seed chết trước dòng đầu tiên).
# ---------------------------------------------------------------------------
FROM runtime AS tools
COPY --from=tools-deps --chown=node:node /app /app
COPY --from=builder --chown=node:node /app/packages/types/dist /app/packages/types/dist
COPY --from=builder --chown=node:node /app/packages/config/tsconfig /app/packages/config/tsconfig
COPY --from=builder --chown=node:node /app/prisma/generated /app/prisma/generated
COPY --from=builder --chown=node:node /app/prisma/dist /app/prisma/dist
COPY --chown=node:node prisma/schema.prisma prisma/prisma.config.ts prisma/tsconfig.json /app/prisma/
COPY --chown=node:node prisma/migrations /app/prisma/migrations
COPY --chown=node:node prisma/src /app/prisma/src
COPY --chown=node:node prisma/data /app/prisma/data
WORKDIR /app/prisma
