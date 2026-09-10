# Thiết kế và định hướng sản phẩm XePrime

> Cập nhật: 09/09/2026

## Nguồn canonical

| Tài liệu | Vai trò |
| --- | --- |
| [`02_PRODUCT_VISION.md`](02_PRODUCT_VISION.md) | Tầm nhìn, persona, mô hình doanh thu và nguyên tắc giá/phí |
| [`03_PRODUCT_GAP_ANALYSIS.md`](03_PRODUCT_GAP_ANALYSIS.md) | Khoảng trống hiện tại và backlog User/Admin/Manage |
| [`07_INFORMATION_ARCHITECTURE.md`](07_INFORMATION_ARCHITECTURE.md) | Cấu trúc trải nghiệm Customer/Owner/Shop/Platform |
| [`09_PRODUCT_FLOWS_AND_BUSINESS_RULES.md`](09_PRODUCT_FLOWS_AND_BUSINESS_RULES.md) | Quy tắc nghiệp vụ mới nhất cho sitemap, user flow, tiền/cọc, hủy và giao nhận |
| [`11_FIGJAM_MASTER_PROMPT.md`](11_FIGJAM_MASTER_PROMPT.md) | Prompt tự chứa toàn bộ sitemap, role, flow, state, tiền và gap để dán vào FigJam AI |
| [`XePrime_Design_Handoff_2026-09-09.xlsx`](XePrime_Design_Handoff_2026-09-09.xlsx) | Workbook có thể lọc: route/màn hình, flow, permission, trạng thái, tiền, vehicle matrix và gap |

## Chuyên đề còn dùng

| Tài liệu | Khi đọc |
| --- | --- |
| [`01_BRAND_GUIDE.md`](01_BRAND_GUIDE.md) | Từ vựng và nhận diện thương hiệu |
| [`04_CREATIVE_BRIEF.md`](04_CREATIVE_BRIEF.md) | Định hướng hình ảnh tổng thể |
| [`05_MOBILE_FIRST_GUIDELINES.md`](05_MOBILE_FIRST_GUIDELINES.md) | Thiết kế web responsive |
| [`06_DESIGN_PRINCIPLES.md`](06_DESIGN_PRINCIPLES.md) | Nguyên tắc ra quyết định UX |
| [`08_UX_GUIDELINES.md`](08_UX_GUIDELINES.md) | Mẫu tương tác, lỗi, bảng và form |
| [`10_IMPLEMENTATION_CONSTRAINTS.md`](10_IMPLEMENTATION_CONSTRAINTS.md) | Ràng buộc khi chuyển thiết kế thành code |

Tài liệu chuyên đề không tự mở rộng scope. Nếu nó mâu thuẫn với Product Vision, Roadmap hoặc ADR mới hơn thì nguồn canonical thắng. Tài liệu `09` ghi lại các quyết định product owner cho đợt redesign; [ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md) đã hợp nhất các xung đột trong mục 13. Release gate pháp lý/thanh toán/bảo hiểm vẫn phải hoàn tất trước khi bật logic tiền thật.

## Bộ bàn giao designer

1. Đọc `02`, `07` và `09` để hiểu sản phẩm, IA và quy tắc.
2. Mở workbook Excel để lọc theo surface, actor, status và priority.
3. Dán prompt `11` vào FigJam AI để dựng board sitemap + user flow.
4. Dùng `01`, `05`, `06`, `08` và `10` khi chuyển flow thành UI và handoff kỹ thuật.

Workbook được sinh lại trên Windows có Microsoft Excel bằng lệnh:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\design-handoff\generate-xeprime-design-handoff.ps1
```
