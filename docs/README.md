# XePrime docs

Tài liệu của dự án, dọn lại ngày 23/07/2026. Chỉ giữ thứ còn dùng cho việc build phase 1–9.

## Đọc theo thứ tự này

| # | File | Là gì | Trạng thái |
| --- | --- | --- | --- |
| 1 | [`decisions/`](decisions/) | **8 ADR — quyết định kỹ thuật kèm lý do. Thắng mọi tài liệu khác khi mâu thuẫn.** | Sống, cập nhật khi có quyết định mới |
| 2 | [`CODEMAP.md`](CODEMAP.md) | Chỉ mục "cái gì nằm ở đâu" trong source | Sống |
| 3 | [`../CLAUDE.md`](../CLAUDE.md) | Bản đồ workspace, kiến trúc chốt, điều cấm, tình trạng phase | Sống |
| 3b | [`design/`](design/) | **Định hướng sản phẩm & thiết kế** (brand, tầm nhìn, gap, IA, UX, thứ tự thiết kế, ràng buộc) — 11 tài liệu, 04/08/2026 | Sống |
| 4 | [`xeprime_screen_spec_by_role_before_db.md`](xeprime_screen_spec_by_role_before_db.md) | Đặc tả màn hình + chức năng theo role | Tham chiếu nghiệp vụ |
| 5 | [`xeprime_overall_user_flow_next_node.md`](xeprime_overall_user_flow_next_node.md) | User flow customer / shop / platform | Tham chiếu nghiệp vụ |
| 6 | [`xeprime_database_design.md`](xeprime_database_design.md) | Thiết kế đầy đủ các bảng (nhiều bảng làm ở phase sau) | Tham chiếu |
| 7 | [`xeprime_build_plan_nextjs_nestjs_prod.md`](xeprime_build_plan_nextjs_nestjs_prod.md) | Lộ trình 9 phase | Tham chiếu |
| 8 | [`xeprime_fe_base_stack_calendar.md`](xeprime_fe_base_stack_calendar.md) | Thiết kế màn lịch (phase 4) | Tham chiếu |

## Lưu ý quan trọng

Bốn tài liệu tham chiếu (5–8) viết ngày 22/07/2026 và **không sửa lại**. Một số quyết định kỹ thuật trong đó đã bị **ADR ghi đè** (PostgreSQL thay MySQL, session cookie, CSS Modules, bộ status chốt…). Khi tài liệu cũ mâu thuẫn với `decisions/`, **ADR thắng**. Giá trị của các file này nằm ở phần **nghiệp vụ/domain**, không ở phần chọn công nghệ.

## Đã xóa (23/07/2026)

- `_archive_2026_07_22/` — phân tích cũ, HTML explainer, roadmap cũ (đã đánh dấu "không cần đọc" từ trước).
- Mọi `.docx` — bản nhị phân trùng nội dung với `.md`, không diff được trong repo code.
- 3 doc dạng "prompt để build base" (`*_master_prompt`, `*_handoff_prompt`, `*_task_prompts`) — base đã build xong và cách làm việc với Claude giờ nằm ở `.claude/skills` + `.claude/agents`.

Tất cả vẫn khôi phục được từ git history nếu cần.

## Làm việc với Claude

Kỷ luật code (senior, tái sử dụng, không hard code, hướng common) nằm ở `../.claude/skills/` — tự kích hoạt theo loại việc. Định vị nhanh + review dùng `../.claude/agents/` (`navigator`, `reviewer`). Xem [`../CLAUDE.md`](../CLAUDE.md) mục "Công cụ Claude".
