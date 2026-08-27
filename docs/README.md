# XePrime docs

Tài liệu của dự án, dọn lại ngày 23/07/2026. Chỉ giữ thứ còn dùng cho việc build phase 1–9.

## Đọc theo thứ tự này

| # | File | Là gì | Trạng thái |
| --- | --- | --- | --- |
| 1 | [`decisions/`](decisions/) | **13 ADR (0001–0013) — quyết định kỹ thuật kèm lý do. Thắng mọi tài liệu khác khi mâu thuẫn.** | Sống, cập nhật khi có quyết định mới |
| 1b | [`mobile-readiness-audit.md`](mobile-readiness-audit.md) | **Mức sẵn sàng cho app native**: cái gì đã dùng chung được, cái gì còn kẹt trong `apps/web`, blocker P0–P3, thứ tự clone. Đọc trước khi mobile dev bắt đầu. | Sống — cập nhật khi đóng blocker |
| 2 | [`CODEMAP.md`](CODEMAP.md) | Chỉ mục "cái gì nằm ở đâu" trong source | Sống |
| 2b | [`api-docs.md`](api-docs.md) | **Tài liệu API (Swagger/OpenAPI)** — mở ở đâu, đăng nhập bằng cookie thế nào để thử gọi, sinh type client, và phải khai gì khi thêm endpoint | Sống |
| 3 | [`../CLAUDE.md`](../CLAUDE.md) | Bản đồ workspace, kiến trúc chốt, điều cấm, tình trạng phase | Sống |
| 3b | [`design/`](design/) | **Định hướng sản phẩm & thiết kế** (brand, tầm nhìn, gap, IA, UX, thứ tự thiết kế, ràng buộc) — 14 tài liệu đánh số + README, 04/08/2026 | Sống |
| 3c | [`design-token-map.md`](design-token-map.md) | **Hợp đồng design token** — Figma `14:*` ↔ `tokens.css` ↔ `theme.ts`, được `theme.test.ts` cưỡng chế. §21 giữ 3 quyết định mã nguồn còn dẫn (P8 breakpoint · P15 hai bộ giá trị · P18 cặp màu trượt AA) | Sống |
| 4 | [`xeprime_screen_spec_by_role_before_db.md`](xeprime_screen_spec_by_role_before_db.md) | Đặc tả màn hình + chức năng theo role | Tham chiếu nghiệp vụ |
| 5 | [`xeprime_overall_user_flow_next_node.md`](xeprime_overall_user_flow_next_node.md) | User flow customer / shop / platform | Tham chiếu nghiệp vụ |
| 6 | [`xeprime_database_design.md`](xeprime_database_design.md) | Thiết kế đầy đủ các bảng (nhiều bảng làm ở phase sau) | Tham chiếu |
| 7 | [`xeprime_build_plan_nextjs_nestjs_prod.md`](xeprime_build_plan_nextjs_nestjs_prod.md) | Lộ trình 9 phase | Tham chiếu |
| 8 | [`xeprime_fe_base_stack_calendar.md`](xeprime_fe_base_stack_calendar.md) | Thiết kế màn lịch (phase 4) | Tham chiếu |

## Lưu ý quan trọng

Bốn tài liệu tham chiếu (5–8) viết ngày 22/07/2026 và **không sửa lại**. Một số quyết định kỹ thuật trong đó đã bị **ADR ghi đè** (PostgreSQL thay MySQL, session cookie, CSS Modules, bộ status chốt…). Khi tài liệu cũ mâu thuẫn với `decisions/`, **ADR thắng**. Giá trị của các file này nằm ở phần **nghiệp vụ/domain**, không ở phần chọn công nghệ.

⚠️ **Cụ thể hơn: đừng chép TÊN ENDPOINT từ bốn tài liệu đó.** Rà ngày 21/08/2026 đối chiếu mọi
endpoint chúng nhắc tới với hợp đồng OpenAPI thật (`packages/types/src/api.generated.ts`, 195
đường dẫn) — các tên sau **không tồn tại**: `/auth/sync-firebase-user`, `/auth/verify-phone`,
`/auth/verify-phone/start`, `/auth/verify-phone/confirm`, `/platform/me`, `/tenants/register-draft`,
`/vehicles/:id/blocked-ranges`, `/bookings/:id/schedule`. Tên thật: OTP đi qua `/auth/phone/send-otp`
· `/auth/phone/verify-otp` · `/auth/phone/login`; khoá xe là `/vehicle-blocks`. **Hợp đồng sinh tự
động là nguồn duy nhất** (ADR 0007) — tra ở đó, không tra ở tài liệu 22/07.

## Đã xóa

### 21/08/2026 — cho `docs/design-briefs/` và `docs/implementation/` nghỉ hưu (24 file, ~11.900 dòng)

Hai bộ này là **ảnh chụp** hệ thống ngày 04/08 và 06/08/2026, viết cho đợt migration Figma→code.
Migration đã thi công xong, và nội dung của chúng đã bị thay thế bởi nguồn sống: hiện trạng ở
[`completion-roadmap.md`](completion-roadmap.md) §0 · trạng thái 97 feature ở file theo dõi Excel ·
"cái gì ở đâu" ở [`CODEMAP.md`](CODEMAP.md) · quyết định ở [`decisions/`](decisions/) · khoảng trống
cho mobile ở [`mobile-readiness-audit.md`](mobile-readiness-audit.md).

Vì sao xoá chứ không giữ:

- **0 dòng mã nào dẫn chiếu `design-briefs/`**; 11/14 brief tự ghi *"Status: Draft for product review"* — chưa từng được duyệt.
- Rà 21/08 spot-check ~15% khẳng định của chúng đã tìm ra **6 câu sai** (ví dụ: bảo `/search` chưa có, bảo huỷ chuyến không có endpoint, bảo `provinceCode` không bao giờ được gửi).
- `FIGMA_NODE_CATALOG.md` liệt kê 26 node `58:*` là production, trong khi chính Figma đã xoá chúng — ảnh chụp một file NGOÀI repo thì không thể giữ đúng.
- Phải dán 8 banner "đừng tin file này" mới dùng được. Tài liệu phải cảnh báo người đọc là nợ, không phải tài sản.

Giữ lại đúng một file: [`design-token-map.md`](design-token-map.md) — nó là hợp đồng token đang được
`theme.test.ts` cưỡng chế, không phải ảnh chụp. Ba quyết định P8/P15/P18 mà mã nguồn còn dẫn đã được
chuyển nguyên văn vào §21 của file đó, và các comment trong mã đã trỏ lại.

### 23/07/2026

- `_archive_2026_07_22/` — phân tích cũ, HTML explainer, roadmap cũ (đã đánh dấu "không cần đọc" từ trước).
- Mọi `.docx` — bản nhị phân trùng nội dung với `.md`, không diff được trong repo code.
- 3 doc dạng "prompt để build base" (`*_master_prompt`, `*_handoff_prompt`, `*_task_prompts`) — base đã build xong và cách làm việc với Claude giờ nằm ở `.claude/skills` + `.claude/agents`.

Tất cả vẫn khôi phục được từ git history nếu cần.

## Làm việc với Claude

Kỷ luật code (senior, tái sử dụng, không hard code, hướng common) nằm ở `../.claude/skills/` — tự kích hoạt theo loại việc. Định vị nhanh + review dùng `../.claude/agents/` (`navigator`, `reviewer`). Xem [`../CLAUDE.md`](../CLAUDE.md) mục "Công cụ Claude".

Commit thì gõ `/commit` (command ở `../.claude/commands/commit.md`) — quy ước branch/commit message và cách xử lý conflict ở [`git-workflow.md`](git-workflow.md).
