# Tài liệu XePrime

> Cập nhật: 14/10/2026
> Trạng thái: nguồn điều hướng chính thức của tài liệu dự án.

XePrime là chợ đăng và thuê xe kết hợp giải pháp quản lý cho thuê xe. Bộ tài liệu được giữ gọn theo ba câu hỏi: **đang xây gì**, **đang ở đâu**, và **vì sao chọn cách này**.

## Đọc theo thứ tự

| Thứ tự | Tài liệu | Trả lời câu hỏi | Trạng thái |
| --- | --- | --- | --- |
| 1 | [`design/02_PRODUCT_VISION.md`](design/02_PRODUCT_VISION.md) | Sản phẩm dành cho ai, hai tuyến chủ xe, cách kiếm tiền và tóm tắt quy tắc nghiệp vụ | Canonical |
| 2 | [`completion-roadmap.md`](completion-roadmap.md) | Hiện trạng, việc tiếp theo và release gate | Canonical |
| 3 | [`design/03_PRODUCT_GAP_ANALYSIS.md`](design/03_PRODUCT_GAP_ANALYSIS.md) | Site khách/đối tác/quản trị đang thiếu hoặc lệch gì | Canonical |
| 4 | [`decisions/`](decisions/) | Quyết định kiến trúc/nghiệp vụ kèm lý do và quan hệ ghi đè | Canonical |
| 5 | [`design/07_INFORMATION_ARCHITECTURE.md`](design/07_INFORMATION_ARCHITECTURE.md) | Ba site, ba không gian tài khoản, menu và lối vào | Canonical |
| 6 | [`CODEMAP.md`](CODEMAP.md) | Khái niệm kỹ thuật đang nằm ở đâu trong source | Sống |

## Thiết kế

| Tài liệu | Phạm vi |
| --- | --- |
| [`design/README.md`](design/README.md) | Cửa vào cho designer |
| [`design/01_BRAND_GUIDE.md`](design/01_BRAND_GUIDE.md) | Thương hiệu, giọng văn, từ vựng |
| [`design/08_UX_GUIDELINES.md`](design/08_UX_GUIDELINES.md) | Nguyên tắc UX/UI, responsive, mẫu tương tác và checklist duy nhất |
| [`design-token-map.md`](design-token-map.md) | Hợp đồng design token dùng chung web + native |

Tài liệu chuyên đề không tự mở rộng scope; mâu thuẫn với nguồn canonical hoặc ADR mới hơn thì nguồn canonical thắng.

## Kỹ thuật và vận hành

| Tài liệu | Phạm vi |
| --- | --- |
| [`api-docs.md`](api-docs.md) | OpenAPI, Swagger, đăng nhập theo realm và hợp đồng type client |
| [`production-launch-runbook.md`](production-launch-runbook.md) | Trình tự lên production từ đầu: tài khoản cần đăng ký, khoá production, env, deploy lần đầu, app lên Google Play; phụ lục production tạm trên VPS staging |
| [`deployment.md`](deployment.md) | Staging/production, ba site, CD và rollback |
| [`backup-and-restore.md`](backup-and-restore.md) | Backup/restore PostgreSQL |
| [`third-party-keys.md`](third-party-keys.md) | OAuth, SMS, SMTP, R2, Maps, Firebase và SePay |
| [`push-notifications.md`](push-notifications.md) | FCM, loại thông báo và đích điều hướng |
| [`realtime-runbook.md`](realtime-runbook.md) | Vận hành huy hiệu/chat realtime và cách chẩn đoán |
| [`phone-auth-and-booking.md`](phone-auth-and-booking.md) | Đăng nhập SĐT + mật khẩu, đăng ký có OTP, quên mật khẩu bằng OTP, đặt xe cần tài khoản (bản nháp qua lượt đăng nhập), mời thành viên bằng SĐT — ADR 0060 |
| [`git-workflow.md`](git-workflow.md) | Quy ước branch/commit và lệnh `/commit` |
| [`qa-accounts.md`](qa-accounts.md) | Tài khoản demo theo site/realm và đường dẫn staging (không chứa mật khẩu) |

## Mobile

Đội mobile giữ tài liệu của mình: [`../apps/mobile/README.md`](../apps/mobile/README.md) (kiến trúc, trạng thái), [`mobile-split-impact.md`](mobile-split-impact.md) (tách hai app — ADR 0051 §5) và các file `mobile-*-module-status.md`. Các file này còn lệch hiện trạng (đường dẫn `apps/mobile/src`, phần tiền ghi theo ADR 0013 đã gỡ) — đội mobile cập nhật khi mở việc; roadmap §6 theo dõi.

## Quy tắc nguồn sự thật

1. Code, migration và OpenAPI trả lời **đã triển khai cái gì**.
2. Product Vision trả lời **sẽ xây cái gì và cho ai**.
3. Completion Roadmap trả lời **làm theo thứ tự nào**.
4. ADR mới nhất ở trạng thái Accepted thắng ADR/tài liệu cũ trong đúng phạm vi nó ghi đè. Tài liệu tóm tắt quy tắc (Product Vision, IA, UX) **dẫn link** sang ADR thay vì chép lại.
5. Một con số về phí, thuế, bảo hiểm hoặc thời hạn rút tiền chỉ được coi là cam kết khi đã được ghi rõ là **đã chốt**; ví dụ minh họa và giả thuyết giá không phải cấu hình production.

Khi một tài liệu mâu thuẫn với code nhưng không có quyết định thay đổi sản phẩm, ghi nhận nó vào Gap Analysis; không tự coi tài liệu cũ là yêu cầu phải phục hồi.

## Kỷ luật cập nhật

- Mọi tài liệu sống phải có ngày cập nhật và trạng thái.
- Không tạo thêm file "plan theo phiên làm việc" trong repo. Plan mode của Claude Code ghi vào `.claude/plans/` (đã gitignore — `.claude/settings.json`). Công việc ngắn hạn đi qua issue/PR; quyết định lâu dài đi qua ADR; tiến độ đi vào một roadmap duy nhất.
- Không tạo prompt dùng một lần, báo cáo kiểm tra một lần hay runbook một lần trong `docs/`; xong việc thì kết quả đi vào roadmap/ADR/Gap Analysis.
- Khi đóng một milestone, cập nhật `completion-roadmap.md` trong cùng PR.
- Khi thay đổi business model, tạo ADR mới và đánh dấu rõ ADR nào bị ghi đè. ADR bị thay **toàn bộ** thì gỡ khỏi repo và ghi vào bảng "ADR đã gỡ" của `decisions/README.md`.
- Không dùng `.docx` hoặc `.xlsx` làm nguồn sự thật vì không review/diff đáng tin cậy trong Git.
- Không ghi mật khẩu, token hay khoá vào tài liệu — kể cả của staging.

## Lịch sử dọn tài liệu

Mọi file đã gỡ vẫn phục hồi được bằng `git log --diff-filter=D -- <đường dẫn>`.

**06/10/2026**

- `docs/plans/` mọc lại 6 file do `plansDirectory` trỏ vào repo — đã gỡ, phần còn mở vào roadmap §6 và ADR 0047.
- `roadmap.html` (ảnh chụp 07/09, trùng roadmap canonical), prompt `CLAUDE_CODE_SHOP_CONSOLIDATION_PROMPT.md`, `refund-to-wallet-backfill-runbook.md` (hết dịp dùng — cảnh báo bước 2c giữ ở roadmap §6), `mobile-badges-notifications-migration.md` (đã xong — việc còn mở vào roadmap §6).
- `design/`: gộp 04 → 01; 05, 06, 10 → 08; 09 → 02 (quy tắc nghiệp vụ) + 07 (vai trò, sơ đồ); 12 → `qa-accounts.md` (bỏ mật khẩu). Gỡ 11 (prompt FigJam), báo cáo `vehicle-management-audit-2026-09-30.md`, hai workbook `.xlsx` và `tools/design-handoff/`.
- ADR 0015 và 0020 gỡ vì đã bị thay toàn bộ (xem `decisions/README.md`).

**03/09/2026**

- Bộ đặc tả trước khi thiết kế database và kế hoạch 9 phase từ tháng 7.
- Báo cáo mobile readiness viết trước khi app native được dựng.
- Các prompt Figma/ChatGPT dùng một lần và Page Design Order cũ.
- Thư mục `docs/plans/` lần thứ nhất.
- File Word kỹ thuật và Excel tracking cũ.
