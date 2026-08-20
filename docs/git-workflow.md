# Git workflow

Quy ước: branch gốc là `develop`. Không commit thẳng vào `main`. Không push/merge tự động.

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
6. Hỏi `Commit these changes? [Y/n]` → chỉ commit khi bạn đồng ý.

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

`/commit` **không bao giờ** push. Review commit xong thì tự push:

```bash
git push -u origin <branch>
```

## Những gì `/commit` cố tình KHÔNG làm

Không chạy build/lint/test, không `pnpm install`, không đọc cả repo, không sửa/format code, không tách commit, không merge, không push. Muốn kiểm tra code thì chạy trước khi gõ `/commit` (xem skill `verify-changes`), hoặc review bằng agent `reviewer`.
