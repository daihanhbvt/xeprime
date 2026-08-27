---
description: Git workflow tự động — kiểm tra → cập nhật develop → tạo branch → add → gộp vào commit chưa push (hoặc commit mới) → push branch. KHÔNG merge, KHÔNG force.
argument-hint: "[ten-task-tuy-chon]"
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git diff:*), Bash(git --no-pager diff:*), Bash(git log:*), Bash(git --no-pager log:*), Bash(git fetch:*), Bash(git merge --ff-only:*), Bash(git switch:*), Bash(git stash:*), Bash(git add:*), Bash(git commit:*), Bash(git restore:*), Bash(git push -u origin:*)
---

# /commit — commit + push nhanh, đơn giản, an toàn

## Bối cảnh đã lấy sẵn — KHÔNG chạy lại các lệnh này

- Branch hiện tại: !`git branch --show-current`
- Trạng thái: !`git status --porcelain=v1 -uall`
- Thống kê diff (tracked): !`git --no-pager diff HEAD --stat`
- Danh sách file (tracked): !`git --no-pager diff HEAD --name-status`
- Commit gần nhất (hash · parent · message): !`git --no-pager log -1 --format="%h · %p · %s"`
- Remote branch chứa commit gần nhất: !`git branch -r --contains HEAD 2>/dev/null`
- Gợi ý tên task từ người dùng (có thể rỗng): $ARGUMENTS

## Luật bất di bất dịch

- ✅ Push **đúng branch vừa commit** bằng `git push -u origin <branch>` (STEP 11).
- ✅ `git commit --amend` **chỉ khi** commit gần nhất chưa có trên remote nào (STEP 6). Amend một commit chưa push vẫn push fast-forward được — không có ngoại lệ nào cho force.
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

**Khi GỘP (STEP 6)**: scope tính trên **toàn bộ** file của commit sau khi gộp, không riêng phần vừa
sửa — chốt lại ở STEP 9 khi đã có `--stat` đầy đủ từ STEP 7. Nếu lúc đó mới lộ ra cả web lẫn
mobile thì áp dụng đúng ngoại lệ hỏi ở trên trước khi commit.

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

## STEP 6 — gộp vào commit trước, hay tạo commit mới

Mặc định là **GỘP**. Điều kiện đúng một dòng, đọc thẳng từ bối cảnh ở đầu file, **không chạy lệnh nào**:

> `Remote branch chứa commit gần nhất` **rỗng** ⇒ commit đó chưa ai thấy ⇒ **GỘP** (`git commit --amend`).

| Bối cảnh | Chế độ | Vì sao |
| --- | --- | --- |
| Rỗng | **GỘP** — thay đổi mới nhập vào commit gần nhất | Chưa push nên chưa ai dựa vào nó; sửa không ghi đè lịch sử của ai |
| Có tên branch (kể cả `origin/develop`) | **Commit mới** | Đã push. Sửa nó = phải force push, mà force push bị cấm |

Một phép thử này bao hết các tình huống, không cần thêm lệnh:

- Vừa tạo branch từ develop ở STEP 5 → commit gần nhất chính là tip của develop → `origin/develop` chứa nó → **commit mới**. Đúng, vì chưa có gì của mình để gộp vào.
- Branch đã push, nay commit lần đầu sau đó → commit gần nhất nằm trên remote → **commit mới**.
- Branch đã push, lần trước đã commit mà chưa push → **GỘP**.
- Branch chưa từng push → **GỘP**.

**Không bao giờ cần force push.** Amend một commit chưa push chỉ làm branch local đi tiếp, nên `git push -u origin <branch>` vẫn là fast-forward như thường.

Hai ngoại lệ **KHÔNG gộp** dù điều kiện trên thoả:

| Ngoại lệ | Dấu hiệu |
| --- | --- |
| Commit gần nhất là **merge commit** | Trường `%p` ở bối cảnh có **hai** hash. Amend một merge là cái bẫy — tạo commit mới |
| Người dùng nói rõ "commit riêng" / "commit mới" trong `$ARGUMENTS` | Ý người dùng thắng mặc định |

## STEP 7 — add

Một lệnh, chọn theo chế độ đã quyết ở STEP 6:

```bash
# Commit mới
git add -A && git --no-pager diff --cached --stat

# GỘP — `--stat` phải tính trên TOÀN BỘ commit sau khi gộp, không riêng phần vừa thêm
git add -A && git --no-pager diff --cached HEAD~1 --stat
```

Stage tất cả (sửa / thêm / xoá). Không phân biệt thay đổi đến từ prompt nào — tất cả là **một task**.

Nếu `git add -A` in cảnh báo `adding embedded git repository` (thư mục worktree/repo lồng nhau) → DỪNG, gỡ ra bằng `git rm --cached -r <dir>`, đề nghị thêm `<dir>` vào `.gitignore`, rồi mới đi tiếp.

## STEP 8 — quét file nhạy cảm (chỉ theo TÊN, không mở file)

Cảnh báo nếu tên file staged khớp: `.env` · `.env.*` · `*.pem` · `*.key` · `*.p12` · `*.pfx` · `*.jks` · `*.keystore` · `id_rsa*` · `*credential*` · `*secret*` · `*service-account*` · `*adminsdk*.json` · `google-services.json` · `GoogleService-Info.plist` · `*.mobileprovision`

Không tính: `*.example` · `*.sample` · `*.template`.

Khớp → DỪNG, liệt kê **tên** file (❌ không đọc, ❌ không in nội dung), hỏi có tiếp tục không. Không đồng ý → gợi ý `git restore --staged <file>` rồi chạy lại `/commit`.

## STEP 9 — commit message

Conventional Commits, **đúng một dòng**: `type(scope): mô tả ngắn`

- `scope` lấy từ STEP 3 (`web` / `mobile` / `api` / `docs` / `repo`), `type` từ STEP 4.
- Mô tả: tiếng Anh, động từ nguyên thể, ≤ 60 ký tự, không dấu chấm cuối.
- ❌ Không body, không bullet, không footer/trailer, không `Co-Authored-By`, không emoji, không "Generated with".
- Nếu `--stat` + `--name-status` chưa đủ để gọi tên thay đổi: chạy **tối đa một** lệnh
  `git --no-pager diff --cached -- <2–3 file chính> | head -150`. Không đọc cả repo.

**Khi GỘP**: message mô tả **cả cụm sau khi gộp**, không phải riêng phần vừa thêm — `type`/`scope`
cũng tính lại trên toàn bộ file mà `git diff --cached HEAD~1 --stat` in ra ở STEP 7. Nếu message cũ
vẫn gọi đúng tên cả cụm thì **giữ nguyên nó**; đổi chữ chỉ để trông khác đi là làm nhiễu lịch sử.

Ví dụ: `feat(web): improve rental calendar` · `fix(api): correct booking price rounding` · `refactor(web): simplify booking state` · `chore(repo): bump prisma to 7.9`

## STEP 10 — xác nhận (bắt buộc)

In đúng khối ngắn này, không thêm phân tích:

```
Branch:  feature/web-rental-calendar   (mới tạo từ develop)
Mode:    Commit mới
Changes: 8 files changed
Commit:  feat(web): improve rental calendar
Push:    origin/feature/web-rental-calendar
```

Khi GỘP thì dòng `Mode` nói rõ gộp vào đâu, và `Changes` là tổng SAU khi gộp:

```
Branch:  feature/web-rental-calendar   (branch hiện tại)
Mode:    Gộp vào commit chưa push ← "feat(web): add rental calendar"
Changes: 12 files changed              (tổng sau khi gộp)
Commit:  feat(web): add rental calendar with pricing
Push:    origin/feature/web-rental-calendar
```

Rồi hỏi: `Commit & push? [Y/n]` — **DỪNG chờ trả lời.** Một lần xác nhận này bao cả commit lẫn push; chỉ chạy STEP 11 sau khi người dùng đồng ý.

## STEP 11 — commit, push và báo cáo

Một lệnh duy nhất:

```bash
# Commit mới
git commit -m "<message>" && git push -u origin <branch> && git --no-pager log -1 --format="%h %s"

# GỘP
git commit --amend -m "<message>" && git push -u origin <branch> && git --no-pager log -1 --format="%h %s"
```

Rồi in:

```
✓ Commit & push successful

Branch:  feature/web-rental-calendar
Mode:    Commit mới          ← hoặc: Gộp vào commit chưa push
Commit:  abc1234
Message: feat(web): improve rental calendar
Push:    origin/feature/web-rental-calendar
```

Khi push gãy — commit đã nằm ở local, **không mất gì**, và **không được** tự sửa bằng force/pull/rebase:

| Tình huống | Xử lý |
| --- | --- |
| Offline / không có remote / thiếu quyền | Báo "commit OK, push fail: <lý do>" + gợi ý chạy lại `git push -u origin <branch>` sau. Không retry vòng lặp |
| Bị từ chối `non-fast-forward` (remote đã đi trước) | DỪNG, báo. ❌ Không `--force`, ❌ không `--force-with-lease`, ❌ không tự `pull`/`rebase` — để người dùng quyết |
| Vừa GỘP mà push bị từ chối | Có người push lên chính branch này trong lúc mình làm. DỪNG như trên; nói rõ commit đã gộp **vẫn còn nguyên ở local**, không mất thay đổi nào |
| Branch hiện tại là `develop` (trường hợp bất thường, không tạo được branch mới) | Chỉ commit, **không push**, báo 1 dòng lý do |

Kết thúc tại đây. Không merge, không tạo PR, không checkout main, không đề nghị làm thêm việc khác.
