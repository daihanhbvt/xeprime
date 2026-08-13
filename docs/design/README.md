# docs/design — Định hướng sản phẩm & thiết kế XePrime

> Ngày tạo: 04/08/2026 · Cập nhật 13/08/2026 (đóng epic Vehicle 360 — xem `docs/completion-roadmap.md` §2.1).
> Bộ tài liệu này định nghĩa **sản phẩm lý tưởng**, không phải bản mô tả UI hiện tại.
> Ngoại lệ: `12_VEHICLE_360_MANAGEMENT.md` §0 ghi trạng thái triển khai thật (đã làm / một phần / hoãn).
> UI hiện tại chỉ dùng để hiểu nghiệp vụ; sản phẩm tham chiếu chỉ dùng để lấy cảm hứng.
> **Mọi yêu cầu nghiệp vụ đã có đều được giữ nguyên** — xem `10_IMPLEMENTATION_CONSTRAINTS.md` §2.

## Đọc theo thứ tự

| # | File | Trả lời câu hỏi | Đọc khi |
| --- | --- | --- | --- |
| 01 | [Brand Guide](01_BRAND_GUIDE.md) | Thương hiệu trông và nói như thế nào | Trước khi vẽ bất cứ thứ gì |
| 02 | [Product Vision](02_PRODUCT_VISION.md) | Ta đang xây cái gì, cho ai, vì sao | Đầu tiên nếu bạn mới vào dự án |
| 03 | [Product Gap Analysis](03_PRODUCT_GAP_ANALYSIS.md) | Còn thiếu gì so với tầm nhìn | Khi lên kế hoạch việc tiếp theo |
| 04 | [Creative Brief](04_CREATIVE_BRIEF.md) | Hướng sáng tạo và tiêu chí duyệt | Trước một đợt thiết kế |
| 05 | [Mobile-First Guidelines](05_MOBILE_FIRST_GUIDELINES.md) | Trên điện thoại thì làm sao | Mọi màn hình, không có ngoại lệ |
| 06 | [Design Principles](06_DESIGN_PRINCIPLES.md) | Phân xử khi hai phương án đều "trông ổn" | Khi tranh luận thiết kế |
| 07 | [Information Architecture](07_INFORMATION_ARCHITECTURE.md) | Cái gì nằm ở đâu, URL ra sao | Khi thêm màn hình mới |
| 08 | [UX Guidelines](08_UX_GUIDELINES.md) | Mẫu tương tác chuẩn, chữ nghĩa, lỗi | Trong lúc thiết kế/triển khai |
| 09 | [Page Design Order](09_PAGE_DESIGN_ORDER.md) | Thiết kế màn nào trước, xong là thế nào | Khi lập kế hoạch |
| 10 | [Implementation Constraints](10_IMPLEMENTATION_CONSTRAINTS.md) | Cái gì rẻ, cái gì đắt, cái gì cấm | Trước khi đề xuất bất cứ điều gì mới |
| 11 | [Figma Master Prompt](11_FIGMA_MASTER_PROMPT.md) | Prompt để sinh design system + màn hình | Khi bắt tay vẽ |
| 12 | [Vehicle 360 Management](12_VEHICLE_360_MANAGEMENT.md) | Quản lý vòng đời xe, policy, nguồn xe, giấy tờ, KM và bảo dưỡng — **§0: cái gì đã là code, cái gì còn hoãn** | Khi chạm vào bất cứ phần nào của hồ sơ xe |
| 13 | [Figma Vehicle 360 Prompts](13_FIGMA_VEHICLE_360_PROMPTS.md) | 4 batch Figma không phá thiết kế cũ | Khi cập nhật Fleet v2 trong Figma |

## Quan hệ với tài liệu còn lại

- **ADR (`docs/decisions/`) vẫn thắng.** Bộ này định hướng sản phẩm/thiết kế; ADR quyết định kỹ thuật. Mâu thuẫn → ADR đúng, tài liệu này phải sửa.
- `docs/completion-roadmap.md` là nguồn "đang ở đâu"; `03` là nguồn "còn cách đích bao xa".
- `docs/xeprime_screen_spec_by_role_before_db.md` là đặc tả nghiệp vụ gốc — bộ này **không** thay thế nó.

## Tóm tắt một trang

**Tầm nhìn**: hệ điều hành của ngành cho thuê xe Việt Nam, và cánh cửa đáng tin để thuê xe từ nó.
**Chiến lược**: phần mềm vận hành là hào, marketplace là nhu cầu — availability trên sàn đúng vì nó chính là lịch vận hành.
**Chỉ số Bắc Đẩu**: số ngày-xe được vận hành trọn vẹn trên XePrime mỗi tháng.
**Ý tưởng thiết kế**: "Bảng điều khiển của một tài sản đang chạy" — câu trả lời trước, công cụ sau; gold chỉ chỗ cần nhìn.
**Ba khoảng trống P0 lớn nhất**: minh bạch giá + lịch trống trên trang xe (khách rơi ở đây) · khách hàng của shop + vận hành trên điện thoại (shop rời đi ở đây) · chuẩn chất lượng ảnh/listing (thương hiệu mất ở đây).
