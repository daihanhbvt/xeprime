# Khối site của app ngoài XePrime

Caddy (`deploy/Caddyfile`) import mọi `*.caddy` trong thư mục này. File `*.caddy` **không vào git** —
deploy của dự án kia cài chúng lên VPS, qua `caddy validate` rồi `caddy reload`.

Quy ước, luật đặt tên trên mạng `xeprime-sites` và site đang chạy: `docs/deployment.md` §10.
