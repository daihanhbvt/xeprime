#!/usr/bin/env node
// Dựng `.env.prodtemp` từ GitHub Environment `prodtemp` — nguồn sự thật DUY NHẤT của cấu hình bản
// tạm. `.github/workflows/deploy-prodtemp.yml` gọi:
//
//   VARS_JSON='${{ toJSON(vars) }}' SECRETS_JSON='${{ toJSON(secrets) }}' node deploy/prodtemp/render-env.mjs > .env.render
//
// MỌI Variable + Secret của Environment đi vào file (trừ hạ tầng deploy bên dưới) — thêm một biến
// mới là thêm nó trên GitHub rồi deploy lại, không sửa file này. Khác deploy.yml (liệt kê từng
// khoá) vì bản tạm không cần lọc theo môi trường: Environment `prodtemp` chỉ phục vụ đúng nó.
//
// Repo không có secret cấp REPOSITORY (kiểm 30/10/2026); `vars` gộp cả ba Variable cấp repo
// (NEXT_PUBLIC_API_URL · NEXT_PUBLIC_APP_NAME · SESSION_COOKIE_NAME) — vô hại, và Variable cùng tên
// của Environment thắng. Thêm secret cấp repo về sau thì nó CŨNG vào file này: thêm tên vào SKIP.
//
// Định dạng giống hệt deploy.yml: `KEY='giá trị'` — đọc được bởi CẢ bash (`backup-db.sh` source
// nó) lẫn compose. Không có cách escape dấu nháy đơn cho cả hai parser, nên gặp là dừng.
import process from 'node:process';

// Hạ tầng deploy — chỉ workflow cần, app thì không.
const SKIP = new Set(['VPS_HOST', 'VPS_SSH_KEY', 'VPS_KNOWN_HOSTS', 'VPS_USER', 'VPS_SSH_PORT', 'VPS_PATH']);

// Cấu trúc của bản tạm, không phải cấu hình — backup-db.sh / restore-db.sh đọc hai biến này.
const FIXED = {
  XP_COMPOSE_FILE: 'deploy/prodtemp/docker-compose.yml',
  XP_APP_SERVICES: 'prod-api prod-web worker',
};

const vars = JSON.parse(process.env.VARS_JSON || '{}');
const secrets = JSON.parse(process.env.SECRETS_JSON || '{}');
const errors = [];
const env = {};

for (const [source, values] of [['Variable', vars], ['Secret', secrets]]) {
  for (const [key, raw] of Object.entries(values)) {
    // `secrets` luôn có `github_token` (chữ thường) — mọi khoá env của app đều VIẾT HOA.
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || SKIP.has(key)) continue;
    const value = String(raw ?? '');
    // Rỗng = chưa khai: để default của schema làm việc (zod từ chối `''` — xem deploy.yml).
    if (value === '') continue;
    if (value.includes("'")) {
      errors.push(`${source} ${key} chứa dấu nháy đơn — bash và compose escape nó theo hai cách loại trừ nhau. Đổi giá trị.`);
      continue;
    }
    if (key in env && source === 'Secret') {
      errors.push(`${key} vừa là Variable vừa là Secret — xoá một bên để không ai phải đoán bên nào thắng.`);
    }
    env[key] = value;
  }
}

// DATABASE_URL suy từ ba biến POSTGRES_* — cùng cách deploy.yml làm, để mật khẩu chỉ khai MỘT chỗ.
if (!env.DATABASE_URL) {
  if (!env.POSTGRES_PASSWORD) {
    errors.push('Thiếu Secret POSTGRES_PASSWORD (hoặc DATABASE_URL).');
  } else {
    const user = env.POSTGRES_USER || 'xeprime';
    const db = env.POSTGRES_DB || 'xeprime';
    env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@db:5432/${encodeURIComponent(db)}`;
  }
}

Object.assign(env, FIXED);

if (errors.length > 0) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}

const lines = [
  '# Sinh tự động bởi .github/workflows/deploy-prodtemp.yml — ĐỪNG sửa tay trên VPS (bị ghi đè).',
  '# Nguồn sự thật: GitHub → Settings → Environments → prodtemp',
  '',
  ...Object.keys(env)
    .sort()
    .map((key) => `${key}='${env[key]}'`),
  '',
];
process.stdout.write(lines.join('\n'));
