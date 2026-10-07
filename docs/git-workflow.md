# Git workflow

> Cập nhật: 06/10/2026 — khớp với `.claude/commands/commit.md` (gộp vào commit chưa push, stage theo đường dẫn khi cây làm việc dùng chung).

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

Quy trình đầy đủ nằm ở [`.claude/commands/commit.md`](../.claude/commands/commit.md) — file đó là
nguồn sự thật; mục này chỉ tóm tắt. Claude sẽ:

1. **Chặn sớm** chỉ bằng bối cảnh lấy sẵn: không có thay đổi → dừng; đang ở `main`/`master` hoặc
   detached HEAD → dừng, không tự switch.
2. **Chọn branch.** Đang ở `develop`: fetch `origin/develop` đúng một lần, fast-forward nếu local
   tụt sau (diverged thì dừng, không rebase/merge), rồi `git switch -c` branch mới. Đang ở
   `feature/…` `fix/…` `refactor/…` `chore/…` (hoặc branch khác như `codex/*`): dùng luôn, không
   fetch, không tạo branch mới.
3. **Gộp hay commit mới** (STEP 6) — mặc định là **GỘP**: commit gần nhất chưa nằm trên remote
   nào ⇒ `git commit --amend` nhập thay đổi mới vào nó (chưa ai thấy nên không ghi đè lịch sử
   của ai, và push vẫn là fast-forward). Commit gần nhất đã có trên remote ⇒ commit mới. Không gộp
   khi commit gần nhất là merge commit, hoặc khi bạn ghi "commit riêng"/"commit mới" trong tham số.
4. **Stage** (STEP 7) — trước hết xác định cây làm việc có **DÙNG CHUNG** với phiên/người khác
   không (có thay đổi mà phiên hiện tại không tạo ra: khu chưa hề đụng tới, số file lớn bất
   thường, migration/`packages/types` của tính năng khác):
   - cây **riêng** → `git add -A` (mọi thay đổi coi là **một task**);
   - cây **DÙNG CHUNG** → `git add -- <từng đường dẫn của task>`, liệt kê tường minh, **không**
     `git add -A`. File bị trộn (cả hai phía cùng sửa) được liệt kê riêng để bạn quyết.
5. Quét **tên** file staged tìm thứ nhạy cảm (`.env*`, `*.pem`, `*.key`, `*credential*`,
   `*secret*`, `*service-account*`, `google-services.json`, `GoogleService-Info.plist`…; trừ
   `*.example`/`*.sample`/`*.template`) — khớp thì dừng và hỏi, không mở file.
6. Tự đặt tên branch + commit message một dòng (khi GỘP: message mô tả cả cụm sau khi gộp; tên
   cũ còn đúng thì giữ nguyên).
7. In khối xác nhận (Branch · Mode · Changes · Commit · Push; cây dùng chung thêm hai dòng
   "Để lại" và "Trộn") rồi hỏi `Commit & push? [Y/n]` → bạn đồng ý thì commit (hoặc `--amend`)
   rồi `git push -u origin <branch>`.

Muốn tự đặt tên task: `/commit rental-calendar` → `feature/web-rental-calendar`.

> ⚠️ Repo này CÓ hiện tượng nhiều phiên/nhiều người sửa **cùng một working tree**. Ngày 14/09/2026
> một commit tính năng đã cuốn trọn thay đổi của phiên khác vào trong nó và không tách ra được nữa
> vì đã push — `git add -A` là cơ chế gây ra chuyện đó. Vì vậy: trên cây dùng chung **không**
> `git add -A`, và **không** `git stash` để "dọn tạm" (stash cất luôn việc của người kia).

## Tên branch & commit message

| | Branch | Commit |
| --- | --- | --- |
| Feature | `feature/web-rental-calendar` | `feat(web): improve rental calendar` |
| Bug fix | `fix/api-booking-price` | `fix(api): correct booking price rounding` |
| Refactor | `refactor/web-booking-state` | `refactor(web): simplify booking state` |
| Chore | `chore/repo-deps` | `chore(repo): bump prisma to 7.9` |
| Chỉ docs · chỉ CSS · chỉ test | `chore/docs-…` | `docs(docs): …` · `style(web): …` · `test(api): …` |

Tên branch `<prefix>/<scope>-<task>`: kebab-case, 2–4 từ, ≤ 30 ký tự. Commit message đúng **một dòng**
Conventional Commits, tiếng Anh, ≤ 60 ký tự — không body, không trailer, không emoji.

Scope suy từ đường dẫn file thay đổi: `apps/web` + `packages/ui` → `web` · `apps/api` + `apps/worker` + `prisma` → `api` · `apps/mobile/**` (`customer`, `manage`, `shared`) → `mobile` · `packages/{types,validators,config}` → theo nhóm còn lại, đứng một mình thì `api` · chỉ `docs/` → `docs` · config gốc/`.claude`/`.github` → `repo`. Nhiều nhóm thì lấy nhóm nhiều file nhất trong `{mobile, web, api}` (hoà → `web`); `docs`/`repo` chỉ khi không có file web/mobile/api. Có **cả web lẫn mobile** → Claude dừng và hỏi trước.

## Khi có conflict

Chỉ xảy ra ở một chỗ: đang ở `develop`, develop local tụt sau `origin/develop`, và Claude cập nhật
bằng `git stash push -u` → `git merge --ff-only origin/develop` → `git switch -c <branch>` →
`git stash pop`. Chuỗi stash này **chỉ dùng khi cây làm việc KHÔNG dùng chung**. Cây dùng chung
thì Claude tạo branch thẳng từ `origin/develop` (`git switch -c <branch> origin/develop`), không
stash; git từ chối vì thay đổi chưa commit đụng file mà develop mới cũng sửa ⇒ Claude dừng và hỏi.

`stash pop` conflict → Claude dừng ngay, in danh sách file conflict (`UU`/`AA`/`DU`) và hỏi:

```
1. Claude tự xử lý conflict
2. Tôi tự xử lý conflict
```

Chọn 2 → Claude dừng hẳn (thay đổi đang ở branch mới, stash entry chưa xoá — `git stash list`).
Chọn 1 → Claude sửa và cho bạn xem `git diff`, vẫn **không** commit cho tới khi bạn xác nhận.

## Push

Sau khi bạn xác nhận, `/commit` chạy `git push -u origin <branch>` — chỉ branch vừa commit, không bao giờ `develop`/`main`, không bao giờ `--force`.

Push gãy thì commit vẫn nằm ở local, không mất gì:

| Tình huống | Claude làm gì |
| --- | --- |
| Offline / thiếu quyền | Báo lý do, gợi ý chạy lại `git push -u origin <branch>` sau |
| `non-fast-forward` (remote đã đi trước branch của bạn) | Dừng và báo. Không force, không tự `pull`/`rebase` — bạn quyết |
| Vừa GỘP (`--amend`) mà push bị từ chối | Có người push lên chính branch đó trong lúc làm. Dừng như trên; commit đã gộp vẫn còn nguyên ở local |
| Vẫn đang ở `develop` (không tạo được branch mới) | Chỉ commit, **không push**, báo lý do |

Merge vào `develop` vẫn làm tay (hoặc qua Pull Request) — `/commit` không tạo PR, không merge.
Merge `develop` → `staging` → `main` cũng vậy, và mỗi lần merge đó là một lần deploy.

## Những gì `/commit` cố tình KHÔNG làm

Không chạy build/lint/test, không `pnpm install`, không đọc cả repo, không sửa/format code, không tách commit, không `git stash` trên cây dùng chung, không `git add -A` trên cây dùng chung, không force push, không merge, không tạo PR. Muốn kiểm tra code thì chạy trước khi gõ `/commit` (xem skill `verify-changes`), hoặc review bằng agent `reviewer`.
