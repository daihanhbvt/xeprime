# Architecture Decision Records — XePrime

Thư mục này ghi các quyết định kiến trúc **kèm lý do**. Khi thực tế va vào tình huống tài liệu chưa lường trước, đọc lý do ở đây để suy luận tiếp — đừng chỉ làm theo quy trình.

Quy tắc: ADR ở đây **thắng** mọi tài liệu khác trong `docs/` khi có mâu thuẫn. Tài liệu trong `docs/` viết ngày 22/07/2026 và không được sửa lại; các ADR ghi rõ chỗ nào đã ghi đè.

| ADR | Nội dung | Trạng thái |
| --- | --- | --- |
| [0001](0001-database-postgresql.md) | Database engine: PostgreSQL 16 thay cho MySQL 8 | Accepted 22/07/2026 |
| [0002](0002-auth-session-cookie.md) | Session bằng httpOnly cookie do NestJS phát | Accepted 22/07/2026 · phần provider bị [0019](0019-backend-led-social-oauth.md) ghi đè |
| [0003](0003-styling-css-modules.md) | Styling: AntD token + CSS Modules, bỏ styled-components | Accepted 22/07/2026 |
| [0004](0004-client-state.md) | Giữ Redux Toolkit, filter đẩy ra URL searchParams | Accepted 22/07/2026 |
| [0005](0005-status-enums.md) | Nguồn chốt duy nhất cho status enum | Accepted 22/07/2026 |
| [0006](0006-booking-concurrency.md) | Cơ chế chống trùng lịch | Accepted 22/07/2026 |
| [0007](0007-api-type-contract.md) | Hợp đồng type FE ↔ BE sinh từ OpenAPI | Accepted 22/07/2026 |
| [0008](0008-public-listings-sync.md) | Quy tắc đồng bộ `public_listings` | Accepted 22/07/2026 |
| [0009](0009-chat-firestore-projection.md) | Chat: Firestore là projection realtime, PostgreSQL là nguồn sự thật | Accepted 27/07/2026 |
| [0010](0010-billing-plans-subscriptions.md) | Gói/thuê bao: history append-only, "hết hạn" suy ra, quota tối thiểu | Accepted 31/07/2026 |
| [0011](0011-long-term-fixed-packages.md) | Thuê dài hạn: gói cố định 1/2/3/6/9/12 THÁNG LỊCH, khách nêu nguyện vọng — gian hàng chốt lịch khi duyệt | Accepted 18/08/2026 |
| [0012](0012-i18n-shared-url-cookie-locale.md) | Đa ngữ vi/en: MỘT url cho cả hai ngôn ngữ, locale ở cookie `XP_LOCALE` đọc phía server; mã nghiệp vụ không dịch | Accepted 19/08/2026 |
| [0013](0013-no-online-payment-mvp.md) | **Không làm thanh toán trực tuyến** ở giai đoạn này; module `payments` là ghi sổ thủ công | Accepted 21/08/2026 |
| [0014](0014-owner-and-shop-single-role.md) | Chủ xe và chủ gian hàng là MỘT vai; năng lực đến từ GÓI, không từ role; nền tảng không đứng giữa quan hệ khách ↔ gian hàng | Accepted 21/08/2026 |
| [0015](0015-vehicle-slot-billing.md) | Cước theo CHỖ XE, trả trước, kỳ tính bằng THÁNG LỊCH; hết hạn thì gỡ khỏi chợ — **sửa ADR 0010** | Accepted 21/08/2026 |
| [0016](0016-sepay-bank-reconciliation.md) | SePay đối soát chuyển khoản tự động cho tiền GÓI — **sửa phạm vi ADR 0013** | Accepted 21/08/2026 |
| [0017](0017-native-bearer-auth.md) | App native xác thực bằng Bearer access token 15 phút + refresh token opaque xoay vòng; web giữ nguyên cookie | Accepted 24/08/2026 |
| [0018](0018-map-delivery-distance.md) | Bản đồ tính khoảng cách giao xe: số tự động là ƯỚC LƯỢNG (chủ xe vẫn chốt), một chiều theo đường bộ, provider trung lập, không tra được không phải lỗi | Accepted 24/08/2026 |
| [0019](0019-backend-led-social-oauth.md) | Đăng nhập Google/Facebook do BACKEND chủ trì (authorization code + PKCE chạy ở server, client không cầm token của provider); Firebase rút về đúng vai chat realtime — **ghi đè phần "Firebase là provider" của ADR 0002** | Accepted 26/08/2026 |
| [0020](0020-two-revenue-tracks-one-marketplace.md) | Hai đường doanh thu trên MỘT chợ: hoa hồng phía chủ xe (chưa mua gói) và gói theo chỗ; giá hiển thị = ĐÚNG giá chủ xe niêm yết — **sửa ADR 0014 điều 5 và ADR 0015 điều 6** | Accepted 28/08/2026 |
| [0021](0021-booking-hold-is-the-commission.md) | Khoản giữ chỗ **LÀ** hoa hồng: khách chuyển online cho nền tảng, phần còn lại trả thẳng chủ xe ⇒ không cần đường chuyển trả — **thu hẹp ADR 0013 ràng buộc 2** | Accepted 28/08/2026 |
| [0022](0022-sepay-customer-money.md) | SePay mở sang tiền của KHÁCH: một sổ giao dịch ngân hàng, hai loại đích, phân loại bằng tiền tố mã — **mở rộng ADR 0016 điều 1, huỷ ADR 0015 điều 5 câu cuối** | Accepted 28/08/2026 |
| [0023](0023-wallet-refund-and-compensation.md) | Ví chỉ chứa tiền hoàn (khách) và tiền bồi thường huỷ muộn (gian hàng); sổ cái append-only, rút bằng chuyển khoản admin thủ công | Accepted 28/08/2026 |
| [0024](0024-billing-mode-from-plan-frozen-on-booking.md) | Chế độ thu phí do GÓI quyết định và ĐÓNG BĂNG vào đơn lúc tạo; nâng cấp giữa chuyến là chuyện không cần xử lý — **mở rộng ADR 0014 điều 3 và ADR 0015 điều 4** | Accepted 28/08/2026 |
| [0025](0025-shop-escrow-hold-and-payout.md) | Gian hàng bật thu cọc qua sàn: nền tảng **giữ tiền hộ** và có đường chuyển trả; hold có `purpose` commission/escrow; cam kết thời gian rút tiền — **thu hẹp ADR 0021 điều 1, viết lại ADR 0023 điều 1–2** | Accepted 29/08/2026 |
| [0026](0026-first-trips-free-then-commission.md) | Hai đơn đầu của một tenant **miễn phí hoàn toàn**; từ đơn thứ ba rơi về tuyến hoa hồng và được sinh sẵn hoá đơn gói — **thay ADR 0015 điều 9** | Accepted 29/08/2026 |
| [0027](0027-feature-tiers-basic-owner-vs-shop.md) | **Hai bậc năng lực**: chủ xe dùng bộ cơ bản (đăng xe, lịch, đơn, giao nhận); gian hàng mở thêm thu chi, công nợ, báo cáo, bảo dưỡng, nhân viên, chi nhánh, tài xế, hợp đồng. Hết hạn gói ⇒ **chỉ đọc**, không mất dữ liệu — **cụ thể hoá ADR 0014 điều 3** | Accepted 29/08/2026 |

## Khi nào viết ADR mới

Viết khi quyết định thoả **cả hai**:

1. Đắt để đảo ngược sau khi đã có code/data.
2. Người đọc code sau này sẽ hỏi "tại sao lại làm thế này?"

Không viết ADR cho lựa chọn thư viện nhỏ, quy ước đặt tên, hay thứ đã ghi trong `CLAUDE.md`.
