# Thiết kế và định hướng sản phẩm XePrime

> Cập nhật: 06/10/2026

## Nguồn canonical

| Tài liệu | Vai trò |
| --- | --- |
| [`02_PRODUCT_VISION.md`](02_PRODUCT_VISION.md) | Tầm nhìn, persona, mô hình doanh thu và nguyên tắc giá/phí |
| [`03_PRODUCT_GAP_ANALYSIS.md`](03_PRODUCT_GAP_ANALYSIS.md) | Khoảng trống hiện tại và backlog theo từng site |
| [`07_INFORMATION_ARCHITECTURE.md`](07_INFORMATION_ARCHITECTURE.md) | Ba site · ba không gian tài khoản, vai trò, menu và lối vào (đăng ký hai tuyến, hỗ trợ gian hàng, mobile) |

## Chuyên đề

| Tài liệu | Khi đọc |
| --- | --- |
| [`01_BRAND_GUIDE.md`](01_BRAND_GUIDE.md) | Thương hiệu: insight, tông, logo, màu, chữ, ảnh, giọng nói và từ vựng chốt |
| [`08_UX_GUIDELINES.md`](08_UX_GUIDELINES.md) | **Guideline UX/UI duy nhất**: tám nguyên tắc, khuôn trang, năm trạng thái, responsive/mobile, lỗi, form, định dạng, quyền, a11y, ràng buộc kỹ thuật và checklist duyệt màn |

Liên quan ngoài thư mục này:

- [`../decisions/`](../decisions/README.md) — ADR; ADR Accepted mới hơn thắng trong đúng phạm vi ghi đè.
- [`../completion-roadmap.md`](../completion-roadmap.md) — đang ở đâu, release gate, việc tiếp theo.
- [`../design-token-map.md`](../design-token-map.md) — bảng token và ánh xạ AntD.
- [`../qa-accounts.md`](../qa-accounts.md) — giới thiệu nhanh, đường dẫn staging từng site và tài khoản demo (không chứa mật khẩu).
- Kỹ sư frontend: skill `.claude/skills/frontend-feature` và `.claude/skills/i18n`.

Tài liệu chuyên đề không tự mở rộng scope. Mâu thuẫn với Product Vision, roadmap hoặc ADR mới hơn thì
nguồn đó thắng. Release gate pháp lý/thanh toán/bảo hiểm vẫn phải hoàn tất trước khi bật logic tiền thật.

## Bắt đầu cho designer

1. Đọc `02` để hiểu sản phẩm và hai tuyến người bán, rồi `07` để biết ai ở site nào, thấy menu gì.
2. Mở staging theo [`../qa-accounts.md`](../qa-accounts.md) và đi thử từng site bằng đúng loại tài khoản.
3. Thiết kế theo `01` (thương hiệu) và `08` (nguyên tắc, mẫu, ràng buộc); chạy checklist `08` §14
   trước khi giao cho kỹ sư.
4. Cần trạng thái, quyền, token hay mục menu mới: theo `08` §13.7 — không tự đặt trong mockup.
