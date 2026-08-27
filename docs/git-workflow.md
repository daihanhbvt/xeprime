# Git workflow

Quy ước: branch gốc là `develop`. Không commit thẳng vào `main`. `/commit` push branch vừa làm lên `origin`, nhưng **không bao giờ** merge và không bao giờ push thẳng `develop`/`main`.

## Ba nhánh = ba môi trường

```
feature/*  →  develop  →  staging  →  main
   PR          PR/merge     merge      merge (có phê duyệt)
              (dev)        (stg)      (production)
```

| Nhánh | Môi trường | Nhận commit thế nào |
| --- | --- | --- |
| `feature/*` `fix/*` `refactor/*` `chore/*` | máy dev | `/commit` |
| `develop` | máy dev | chỉ merge từ nhánh việc, qua PR |
| `staging` | `stg.xeprime.vn` | **chỉ merge từ `develop`** |
| `main` | `xeprime.vn` | **chỉ merge từ `staging`** |

`staging` và `main` **không bao giờ nhận commit trực tiếp**. Mỗi lần merge vào chúng là **một
lần deploy tự động** (`.github/workflows/deploy.yml`) — nên một commit vá vội đẩy thẳng lên
`staging` là một lần deploy chưa ai xem qua PR.

Chỉ thăng cấp lên `main` thứ **đã chạy thật trên staging**. Đó là lý do `staging` tồn tại; bỏ
qua nó thì nó chỉ còn là một nhánh tốn tiền VPS.

> Deploy một commit cụ thể, hoặc lùi về bản trước, thì **không** dùng git — dùng Run workflow ở
> tab Actions (`docs/deployment.md` §9.1). Đẩy ngược lịch sử để lùi phiên bản là cách làm hỏng
> cả hai thứ cùng lúc.

## Khi đang code

Code bình thường. Claude **không** tự commit.

## Khi code xong và đã review bằng mắt

```
/commit
```

Claude sẽ:

1. Kiểm tra branch + thay đổi hiện tại (không có thay đổi → dừng).
2. Nếu đang ở `develop`: fetch + fast-forward `develop`, rồi tạo branch mới.
   Nếu đang ở branch `feature/…` `fix/…` `refactor/…` `chore/…`: dùng luôn branch đó.
   Nếu đang ở `main`: dừng, không commit.
3. `git add -A` toàn bộ thay đổi (coi là **một task**, không tách theo prompt).
4. Quét nhanh tên file nhạy cảm (`.env`, `*.pem`, `*service-account*`…) — có thì dừng và hỏi.
5. Tự đặt tên branch + commit message.
6. Hỏi `Commit & push? [Y/n]` → bạn đồng ý thì commit rồi `git push -u origin <branch>`.

Muốn tự đặt tên task: `/commit rental-calendar` → `feature/web-rental-calendar`.

## Tên branch & commit message

| | Branch | Commit |
| --- | --- | --- |
| Feature | `feature/web-rental-calendar` | `feat(web): improve rental calendar` |
| Bug fix | `fix/api-booking-price` | `fix(api): correct booking price rounding` |
| Refactor | `refactor/web-booking-state` | `refactor(web): simplify booking state` |
| Chore | `chore/repo-deps` | `chore(repo): bump prisma to 7.9` |

Scope suy từ đường dẫn file thay đổi: `apps/web` + `packages/ui` → `web` · `apps/api` + `apps/worker` + `prisma` → `api` · `apps/mobile` (khi có) → `mobile` · chỉ `docs/` → `docs` · config gốc/`.claude` → `repo`. Nhiều nhóm thì lấy nhóm nhiều file nhất. Có **cả web lẫn mobile** → Claude dừng và hỏi trước.

## Khi có conflict

Chỉ xảy ra ở bước `stash pop` sau khi cập nhật `develop`. Claude dừng ngay, in danh sách file conflict và hỏi:

```
1. Claude tự xử lý conflict
2. Tôi tự xử lý conflict
```

Chọn 2 → Claude dừng hẳn. Chọn 1 → Claude sửa và cho bạn xem `git diff`, vẫn **không** commit cho tới khi bạn xác nhận.

## Push

Sau khi bạn xác nhận, `/commit` chạy `git push -u origin <branch>` — chỉ branch vừa commit, không bao giờ `develop`/`main`, không bao giờ `--force`.

Push gãy thì commit vẫn nằm ở local, không mất gì:

| Tình huống | Claude làm gì |
| --- | --- |
| Offline / thiếu quyền | Báo lý do, gợi ý chạy lại `git push -u origin <branch>` sau |
| `non-fast-forward` (remote đã đi trước branch của bạn) | Dừng và báo. Không force, không tự `pull`/`rebase` — bạn quyết |

Merge vào `develop` vẫn làm tay (hoặc qua Pull Request) — `/commit` không tạo PR, không merge.
Merge `develop` → `staging` → `main` cũng vậy, và mỗi lần merge đó là một lần deploy.

## Những gì `/commit` cố tình KHÔNG làm

Không chạy build/lint/test, không `pnpm install`, không đọc cả repo, không sửa/format code, không tách commit, không force push, không merge, không tạo PR. Muốn kiểm tra code thì chạy trước khi gõ `/commit` (xem skill `verify-changes`), hoặc review bằng agent `reviewer`.
