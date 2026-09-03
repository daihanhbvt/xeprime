# Tài liệu XePrime

> Cập nhật: 03/09/2026
> Trạng thái: nguồn điều hướng chính thức của tài liệu dự án.

XePrime là chợ đăng và thuê xe kết hợp giải pháp quản lý cho thuê xe. Bộ tài liệu được giữ gọn theo ba câu hỏi: **đang xây gì**, **đang ở đâu**, và **vì sao chọn cách này**.

Muốn theo dõi trực quan và lấy prompt triển khai cho Claude Code, mở [`roadmap.html`](roadmap.html). Trang này lưu checkbox trong trình duyệt và là lớp hiển thị; khi nội dung khác Markdown thì `completion-roadmap.md` vẫn là nguồn canonical.

## Đọc theo thứ tự

| Thứ tự | Tài liệu | Trả lời câu hỏi | Trạng thái |
| --- | --- | --- | --- |
| 1 | [`design/02_PRODUCT_VISION.md`](design/02_PRODUCT_VISION.md) | Sản phẩm dành cho ai, hai mô hình chủ xe và cách kiếm tiền | Canonical |
| 2 | [`completion-roadmap.md`](completion-roadmap.md) | Hiện trạng, việc tiếp theo và release gate | Canonical |
| 3 | [`roadmap.html`](roadmap.html) | Checklist trực quan, tiến độ cục bộ và thư viện prompt Claude Code | UI theo dõi |
| 4 | [`design/03_PRODUCT_GAP_ANALYSIS.md`](design/03_PRODUCT_GAP_ANALYSIS.md) | User/Admin/Manage đang thiếu hoặc thừa gì | Canonical |
| 5 | [`decisions/`](decisions/) | Quyết định kiến trúc/nghiệp vụ kèm lý do và quan hệ ghi đè | Canonical |
| 6 | [`design/07_INFORMATION_ARCHITECTURE.md`](design/07_INFORMATION_ARCHITECTURE.md) | Phân bề mặt Customer/Owner/Shop/Platform | Canonical |
| 7 | [`CODEMAP.md`](CODEMAP.md) | Khái niệm kỹ thuật đang nằm ở đâu trong source | Sống |

## Tài liệu kỹ thuật còn dùng

| Tài liệu | Phạm vi |
| --- | --- |
| [`api-docs.md`](api-docs.md) | OpenAPI, Swagger và hợp đồng type client |
| [`deployment.md`](deployment.md) | Staging/production, CD và rollback |
| [`backup-and-restore.md`](backup-and-restore.md) | Backup/restore PostgreSQL |
| [`third-party-keys.md`](third-party-keys.md) | OAuth, SMS, SMTP, R2, Maps, Firebase và SePay |
| [`git-workflow.md`](git-workflow.md) | Quy ước branch/commit |
| [`design-token-map.md`](design-token-map.md) | Hợp đồng design token dùng chung |
| [`guest-booking-passwordless.md`](guest-booking-passwordless.md) | Quyết định chi tiết cho guest/passwordless booking |
| [`../apps/mobile/README.md`](../apps/mobile/README.md) | Kiến trúc và trạng thái app native |

Các đặc tả trong `design/` ngoài ba file canonical là tài liệu chuyên đề. Chúng vẫn hữu ích khi làm UI hoặc một miền nghiệp vụ cụ thể, nhưng không được dùng để suy ra roadmap hay mô hình doanh thu.

## Quy tắc nguồn sự thật

1. Code, migration và OpenAPI trả lời **đã triển khai cái gì**.
2. Product Vision trả lời **sẽ xây cái gì và cho ai**.
3. Completion Roadmap trả lời **làm theo thứ tự nào**.
4. ADR mới nhất ở trạng thái Accepted thắng ADR/tài liệu cũ trong đúng phạm vi nó ghi đè.
5. Một con số về phí, thuế, bảo hiểm hoặc thời hạn rút tiền chỉ được coi là cam kết khi đã được ghi rõ là **đã chốt**; ví dụ minh họa và giả thuyết giá không phải cấu hình production.

Khi một tài liệu mâu thuẫn với code nhưng không có quyết định thay đổi sản phẩm, ghi nhận nó vào Gap Analysis; không tự coi tài liệu cũ là yêu cầu phải phục hồi.

## Kỷ luật cập nhật

- Mọi tài liệu sống phải có ngày cập nhật và trạng thái.
- Không tạo thêm file “plan theo phiên làm việc” trong repo. Công việc ngắn hạn đi qua issue/PR; quyết định lâu dài đi qua ADR; tiến độ đi vào một roadmap duy nhất.
- Khi đóng một milestone, cập nhật `completion-roadmap.md` trong cùng PR.
- Khi roadmap hoặc release gate đổi, đồng bộ nội dung và prompt trong `roadmap.html`; checkbox cá nhân không được commit làm bằng chứng hoàn thành.
- Khi thay đổi business model, tạo ADR mới và đánh dấu rõ ADR nào bị ghi đè.
- Không dùng `.docx` hoặc `.xlsx` làm nguồn sự thật vì không review/diff đáng tin cậy trong Git.

## Dọn tài liệu ngày 03/09/2026

Đã loại khỏi nhánh hiện tại:

- Bộ đặc tả trước khi thiết kế database và kế hoạch 9 phase từ tháng 7; code/ADR hiện tại đã thay thế.
- Báo cáo mobile readiness viết trước khi app native được dựng; trạng thái mobile nay nằm ở `apps/mobile/README.md` và roadmap.
- Các prompt Figma/ChatGPT dùng một lần và Page Design Order cũ.
- Thư mục `docs/plans/` gồm các kế hoạch triển khai theo phiên; phần còn giá trị đã được hấp thụ vào roadmap/ADR.
- File Word kỹ thuật và Excel tracking cũ.

Các file này vẫn phục hồi được từ lịch sử Git nếu cần điều tra nguồn gốc một quyết định.
