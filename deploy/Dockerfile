# syntax=docker/dockerfile:1.7
#
# MỘT image cho BỐN tiến trình: api · web · worker · migrate/seed.
#
# Vì sao một image chứ không phải bốn:
#
#  1. Monorepo pnpm nối các package `@xeprime/*` bằng SYMLINK trong `node_modules`. Cắt nhỏ cây
#     đó cho từng service (`pnpm deploy`, prune thủ công) là chỗ hỏng lúc 2 giờ sáng, không phải
#     chỗ tiết kiệm. Một cây node_modules nguyên vẹn thì `node dist/main.js` chạy hoặc không
#     chạy ngay tại chỗ build.
#  2. `prisma migrate deploy` cần Prisma CLI — một devDependency. Tách image production "chỉ
#     prod deps" nghĩa là phải dựng thêm một image nữa chỉ để chạy migration.
#  3. VPS MVP là MỘT máy (CLAUDE.md §3). Bốn service dùng chung một image = một lần build, một
#     lớp cache, một thứ để `docker image prune` dọn.
#
# Đánh đổi: image ~2–3GB vì giữ cả devDependencies. Trên đĩa 50GB đó là ~5%, và đổi lại là khả
# năng chạy migration/seed/`next start` từ đúng cây thư viện đã build ra artifact.
#
# Build (từ GỐC REPO):
#   docker compose -f docker-compose.prod.yml build
# Các giá trị `NEXT_PUBLIC_*` bị Next NHÚNG CỨNG vào bundle lúc build, nên chúng là --build-arg
# chứ không phải biến runtime. Đổi tên miền = build lại web.

# ---------------------------------------------------------------------------
# base — nền chung cho mọi stage
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

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl curl tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

# ---------------------------------------------------------------------------
# deps — cài node_modules từ MANIFEST (layer này chỉ vỡ cache khi package.json/lockfile đổi)
# ---------------------------------------------------------------------------
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Liệt kê TỪNG manifest thay vì `COPY . .`: mục đích của stage này là cache. Copy cả source
# vào đây thì mỗi lần sửa một dòng TSX là cài lại toàn bộ dependency (~5–8 phút trên E5 v4).
#
# `apps/mobile/package.json` phải có mặt dù app native KHÔNG được cài (xem --filter bên dưới):
# `--frozen-lockfile` đối chiếu lockfile với TOÀN BỘ importer, thiếu một manifest là fail.
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/config/package.json ./packages/config/
COPY packages/domain/package.json ./packages/domain/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validators/package.json ./packages/validators/
COPY prisma/package.json ./prisma/

# `--filter "<pkg>..."` = package đó + mọi thứ nó phụ thuộc. Bốn filter này phủ hết cây build
# và CỐ Ý bỏ `@xeprime/mobile`: Expo + React Native là ~1GB không có việc gì trên server web.
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
ARG NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY=
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
ARG NEXT_PUBLIC_FIREBASE_APP_ID=
# Đai an toàn, KHÔNG phải thứ quyết định hành vi: `proxy.ts` đọc `SESSION_COOKIE_NAME` lúc CHẠY
# (đo trực tiếp — Next 16 chỉ nhúng cứng `NEXT_PUBLIC_*`), nên giá trị thật đến từ
# `environment:` của service `web` trong docker-compose.prod.yml. Giữ ARG ở đây để `.env` trong
# image mô tả đúng cấu hình đã build, và để không gãy nếu một bản Next sau này quay lại nhúng
# cứng biến đó.
ARG SESSION_COOKIE_NAME=xp_session

RUN test -n "$NEXT_PUBLIC_API_URL" \
    || (echo 'NEXT_PUBLIC_API_URL là bắt buộc: trình duyệt gọi API bằng chính giá trị này.' && exit 1)

COPY . .

# Mọi script của repo chạy qua `dotenv -e ../../.env`, nên file này phải tồn tại lúc build.
# CHỈ chứa giá trị công khai — DATABASE_URL, secret phiên, khoá SMTP/eSMS đi vào lúc CHẠY qua
# `env_file` của compose, và dotenv KHÔNG ghi đè biến môi trường đã có (không có cờ `-o`), nên
# file này không thể che mất cấu hình runtime.
RUN printf '%s\n' \
      "NODE_ENV=production" \
      "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" \
      "NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME" \
      "NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY" \
      "NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY" \
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID" \
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" \
      "NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID" \
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

# Dọn thứ không dùng lúc chạy. `.next/cache` là cache build (vài trăm MB), `apps/mobile` là
# source app native, `.turbo` là log task runner.
RUN rm -rf apps/web/.next/cache apps/mobile .turbo

# ---------------------------------------------------------------------------
# runner — image cuối
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production

# `node` là user có sẵn (uid 1000) trong image chính thức. Chạy production bằng root là thói
# quen xấu không có lý do gì để giữ. `.next/cache` được ghi lúc chạy nên phải thuộc user này.
COPY --from=builder --chown=node:node /app /app

USER node
WORKDIR /app

# Không có CMD mặc định: mỗi service trong docker-compose.prod.yml khai lệnh của chính nó
# (api · web · worker · migrate). Một CMD mặc định ở đây chỉ tạo ảo giác "chạy được luôn".
