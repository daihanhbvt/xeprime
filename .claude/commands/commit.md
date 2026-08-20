---
description: Git workflow tự động — kiểm tra → cập nhật develop → tạo branch → add → commit → push branch. KHÔNG merge.
argument-hint: "[ten-task-tuy-chon]"
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git diff:*), Bash(git --no-pager diff:*), Bash(git log:*), Bash(git --no-pager log:*), Bash(git fetch:*), Bash(git merge --ff-only:*), Bash(git switch:*), Bash(git stash:*), Bash(git add:*), Bash(git commit:*), Bash(git restore:*), Bash(git push -u origin:*)
---

# /commit — commit + push nhanh, đơn giản, an toàn

## Bối cảnh đã lấy sẵn — KHÔNG chạy lại các lệnh này

- Branch hiện tại: !`git branch --show-current`
- Trạng thái: !`git status --porcelain=v1 -uall`
- Thống kê diff (tracked): !`git --no-pager diff HEAD --stat`
- Danh sách file (tracked): !`git --no-pager diff HEAD --name-status`
- Gợi ý tên task từ người dùng (có thể rỗng): $ARGUMENTS

## Luật bất di bất dịch

- ✅ Push **đúng branch vừa commit** bằng `git push -u origin <branch>` (STEP 10).
- ❌ `git push --force` / `--force-with-lease` · push `main` / `master` / `develop` · `git merge` (ngoại lệ duy nhất: `git merge --ff-only origin/develop`) · `git rebase` · `git checkout main` · tạo Pull Request.
- ❌ Sửa code, format, refactor, sửa bug ngoài phạm vi. **Chỉ thao tác Git.** Thấy vấn đề thì báo, không tự sửa.
- ❌ Chạy build / lint / test / typecheck / install. ❌ Đọc source ngoài diff. ❌ Gọi subagent.
- ❌ Commit khi người dùng chưa xác nhận.
- ⏱️ Toàn bộ quy trình tối đa **~3 lệnh Bash**. Nhanh là yêu cầu bắt buộc, không phải mong muốn.

## STEP 1 — chặn sớm (chỉ đọc bối cảnh trên, không chạy lệnh)

| Tình huống | Xử lý |
| --- | --- |
| Branch rỗng (detached HEAD) hoặc không phải git repo | DỪNG, báo lý do |
| Status rỗng | In "Không có thay đổi để commit." → **DỪNG ngay**, không chạy thêm lệnh nào |
| Branch = `main` / `master` | DỪNG: "Không được commit trực tiếp vào main. Chuyển sang `develop` rồi chạy lại /commit." Không tự switch |

## STEP 2 — chọn branch đích

| Branch hiện tại | Làm gì |
| --- | --- |
| `develop` | Tạo branch mới → STEP 3, 4, 5 |
| `feature/*` `fix/*` `refactor/*` `chore/*` | Dùng luôn branch hiện tại. **Không** tạo branch mới, **không** fetch → nhảy thẳng STEP 6 |
| Branch khác (vd `codex/*`) | Dùng luôn branch hiện tại, ghi chú 1 dòng trong summary. Không tạo, không switch |

Chỉ khi đang ở `develop` mới tạo branch mới. Không bao giờ tự chuyển branch của người dùng.

## STEP 3 — scope, suy từ ĐƯỜNG DẪN file thay đổi

| Đường dẫn | scope |
| --- | --- |
| `apps/web/**`, `packages/ui/**` | `web` |
| `apps/mobile/**`, `apps/*-mobile/**`, hoặc app có `react-native` trong package.json | `mobile` |
| `apps/api/**`, `apps/worker/**`, `prisma/**` | `api` |
| `packages/{types,validators,config}/**` | theo nhóm còn lại; nếu chỉ có mình nó → `api` |
| `docs/**` | `docs` |
| Config gốc, `.claude/**`, `.github/**` | `repo` |

Nhiều nhóm cùng lúc → lấy nhóm **nhiều file nhất** trong `{mobile, web, api}`; hòa → `web`. `docs`/`repo` chỉ được chọn khi không có file nào thuộc web/mobile/api.

**Ngoại lệ bắt buộc hỏi:** có file của **cả web lẫn mobile** → DỪNG, báo số file mỗi bên, hỏi *"Đang có thay đổi của cả Web và Mobile. Gom tất cả vào MỘT commit?"*. Không tự tách commit.

Repo hiện chưa có app React Native → thực tế scope sẽ là `web` / `api` / `docs` / `repo`.

## STEP 4 — type

| Dấu hiệu | type | prefix branch |
| --- | --- | --- |
| Thêm màn hình / endpoint / khả năng mới | `feat` | `feature/` |
| Sửa hành vi sai | `fix` | `fix/` |
| Đổi cấu trúc, hành vi không đổi | `refactor` | `refactor/` |
| Deps / lockfile / config / CI | `chore` | `chore/` |
| Chỉ docs | `docs` | `chore/` |
| Chỉ CSS / layout | `style` | `chore/` |
| Chỉ test | `test` | `chore/` |

Chọn theo thay đổi **chính**, không cố mô tả hết.

## STEP 5 — cập nhật develop rồi tạo branch (chỉ khi đang ở `develop`)

Tên branch: `<prefix>/<scope>-<task-name>` — kebab-case, 2–4 từ, ≤ 30 ký tự.
Có `$ARGUMENTS` thì dùng làm task-name (kebab-hoá). Ví dụ: `feature/web-rental-calendar`, `fix/api-booking-price`, `refactor/web-booking-state`, `chore/repo-deps`.

**Lệnh 1** — fetch đúng một lần và đo khoảng cách:

```bash
git fetch origin develop --quiet; git rev-list --left-right --count develop...origin/develop
```

Kết quả `A<TAB>B`: A = commit chỉ có ở local, B = commit chỉ có ở remote.

| A / B | Lệnh 2 |
| --- | --- |
| B = 0 (develop đã mới nhất) | `git switch -c <branch>` — thay đổi đi theo branch mới, không mất gì |
| B > 0, A = 0 | `git stash push -u -m xp-commit && git merge --ff-only origin/develop && git switch -c <branch> && git stash pop` |
| A > 0 **và** B > 0 (diverged) | DỪNG. Không rebase, không merge. Báo: develop local đã rẽ nhánh khỏi origin/develop, cần xử lý tay |
| A > 0, B = 0 | Tạo branch bình thường (`git switch -c`), ghi chú 1 dòng: develop có commit chưa push |
| `fetch` fail (offline / không remote) | Bỏ qua bước cập nhật, ghi chú 1 dòng, tiếp tục `git switch -c` |

`stash push -u` + `merge --ff-only origin/develop` = `git pull --ff-only origin develop` nhưng không fetch lần hai.

Nếu chuỗi lệnh gãy giữa chừng:

- `merge --ff-only` fail → chạy `git stash pop` trả lại nguyên trạng, rồi DỪNG và báo lý do.
- `git switch -c` fail vì **branch đã tồn tại** → DỪNG, hỏi: dùng lại branch đó hay đặt tên khác. (Thay đổi vẫn đang trong stash — nói rõ điều này.)
- **`stash pop` conflict → DỪNG NGAY.** Không sửa, không commit, không `git checkout`. Chạy `git status --short`, in danh sách file conflict (`UU` / `AA` / `DU`), rồi hỏi đúng câu:

  > Conflict detected. Bạn muốn:
  > 1. Claude tự xử lý conflict
  > 2. Tôi tự xử lý conflict

  - Chọn **1** → đọc từng file conflict, giải thích ngắn từng chỗ, sửa marker, chạy `git --no-pager diff` cho người dùng xem, rồi DỪNG chờ xác nhận. Không commit trước khi được xác nhận.
  - Chọn **2** → dừng hoàn toàn. Nhắc: thay đổi đang ở branch mới, stash entry chưa xoá (`git stash list`).

## STEP 6 — add

```bash
git add -A && git --no-pager diff --cached --stat
```

Stage tất cả (sửa / thêm / xoá). Không phân biệt thay đổi đến từ prompt nào — tất cả là **một task**.

Nếu `git add -A` in cảnh báo `adding embedded git repository` (thư mục worktree/repo lồng nhau) → DỪNG, gỡ ra bằng `git rm --cached -r <dir>`, đề nghị thêm `<dir>` vào `.gitignore`, rồi mới đi tiếp.

## STEP 7 — quét file nhạy cảm (chỉ theo TÊN, không mở file)

Cảnh báo nếu tên file staged khớp: `.env` · `.env.*` · `*.pem` · `*.key` · `*.p12` · `*.pfx` · `*.jks` · `*.keystore` · `id_rsa*` · `*credential*` · `*secret*` · `*service-account*` · `*adminsdk*.json` · `google-services.json` · `GoogleService-Info.plist` · `*.mobileprovision`

Không tính: `*.example` · `*.sample` · `*.template`.

Khớp → DỪNG, liệt kê **tên** file (❌ không đọc, ❌ không in nội dung), hỏi có tiếp tục không. Không đồng ý → gợi ý `git restore --staged <file>` rồi chạy lại `/commit`.

## STEP 8 — commit message

Conventional Commits, **đúng một dòng**: `type(scope): mô tả ngắn`

- `scope` lấy từ STEP 3 (`web` / `mobile` / `api` / `docs` / `repo`), `type` từ STEP 4.
- Mô tả: tiếng Anh, động từ nguyên thể, ≤ 60 ký tự, không dấu chấm cuối.
- ❌ Không body, không bullet, không footer/trailer, không `Co-Authored-By`, không emoji, không "Generated with".
- Nếu `--stat` + `--name-status` chưa đủ để gọi tên thay đổi: chạy **tối đa một** lệnh
  `git --no-pager diff --cached -- <2–3 file chính> | head -150`. Không đọc cả repo.

Ví dụ: `feat(web): improve rental calendar` · `fix(api): correct booking price rounding` · `refactor(web): simplify booking state` · `chore(repo): bump prisma to 7.9`

## STEP 9 — xác nhận (bắt buộc)

In đúng khối ngắn này, không thêm phân tích:

```
Branch:  feature/web-rental-calendar   (mới tạo từ develop)
Changes: 8 files changed
Commit:  feat(web): improve rental calendar
Push:    origin/feature/web-rental-calendar
```

Rồi hỏi: `Commit & push? [Y/n]` — **DỪNG chờ trả lời.** Một lần xác nhận này bao cả commit lẫn push; chỉ chạy STEP 10 sau khi người dùng đồng ý.

## STEP 10 — commit, push và báo cáo

Một lệnh duy nhất:

```bash
git commit -m "<message>" && git push -u origin <branch> && git --no-pager log -1 --format="%h %s"
```

Rồi in:

```
✓ Commit & push successful

Branch:  feature/web-rental-calendar
Commit:  abc1234
Message: feat(web): improve rental calendar
Push:    origin/feature/web-rental-calendar
```

Khi push gãy — commit đã nằm ở local, **không mất gì**, và **không được** tự sửa bằng force/pull/rebase:

| Tình huống | Xử lý |
| --- | --- |
| Offline / không có remote / thiếu quyền | Báo "commit OK, push fail: <lý do>" + gợi ý chạy lại `git push -u origin <branch>` sau. Không retry vòng lặp |
| Bị từ chối `non-fast-forward` (remote đã đi trước) | DỪNG, báo. ❌ Không `--force`, ❌ không `--force-with-lease`, ❌ không tự `pull`/`rebase` — để người dùng quyết |
| Branch hiện tại là `develop` (trường hợp bất thường, không tạo được branch mới) | Chỉ commit, **không push**, báo 1 dòng lý do |

Kết thúc tại đây. Không merge, không tạo PR, không checkout main, không đề nghị làm thêm việc khác.
