# Architecture Decision Records — XePrime

Thư mục này ghi các quyết định kiến trúc **kèm lý do**. Khi thực tế va vào tình huống tài liệu chưa lường trước, đọc lý do ở đây để suy luận tiếp — đừng chỉ làm theo quy trình.

Quy tắc: ADR ở đây **thắng** mọi tài liệu khác trong `docs/` khi có mâu thuẫn. Tài liệu trong `docs/` viết ngày 22/07/2026 và không được sửa lại; các ADR ghi rõ chỗ nào đã ghi đè.

| ADR | Nội dung | Trạng thái |
| --- | --- | --- |
| [0001](0001-database-postgresql.md) | Database engine: PostgreSQL 16 thay cho MySQL 8 | Accepted 22/07/2026 |
| [0002](0002-auth-session-cookie.md) | Session bằng httpOnly cookie do NestJS phát | Accepted 22/07/2026 |
| [0003](0003-styling-css-modules.md) | Styling: AntD token + CSS Modules, bỏ styled-components | Accepted 22/07/2026 |
| [0004](0004-client-state.md) | Giữ Redux Toolkit, filter đẩy ra URL searchParams | Accepted 22/07/2026 |
| [0005](0005-status-enums.md) | Nguồn chốt duy nhất cho status enum | Accepted 22/07/2026 |
| [0006](0006-booking-concurrency.md) | Cơ chế chống trùng lịch | Accepted 22/07/2026 |
| [0007](0007-api-type-contract.md) | Hợp đồng type FE ↔ BE sinh từ OpenAPI | Accepted 22/07/2026 |
| [0008](0008-public-listings-sync.md) | Quy tắc đồng bộ `public_listings` | Accepted 22/07/2026 |
| [0009](0009-chat-firestore-projection.md) | Chat: Firestore là projection realtime, PostgreSQL là nguồn sự thật | Accepted 27/07/2026 |
| [0010](0010-billing-plans-subscriptions.md) | Gói/thuê bao: history append-only, "hết hạn" suy ra, quota tối thiểu | Accepted 31/07/2026 |
| [0011](0011-long-term-fixed-packages.md) | Thuê dài hạn: gói cố định 1/2/3/6/9/12 THÁNG LỊCH, khách nêu nguyện vọng — gian hàng chốt lịch khi duyệt | Accepted 18/08/2026 |

## Khi nào viết ADR mới

Viết khi quyết định thoả **cả hai**:

1. Đắt để đảo ngược sau khi đã có code/data.
2. Người đọc code sau này sẽ hỏi "tại sao lại làm thế này?"

Không viết ADR cho lựa chọn thư viện nhỏ, quy ước đặt tên, hay thứ đã ghi trong `CLAUDE.md`.
