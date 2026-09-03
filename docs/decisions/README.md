# Architecture Decision Records — XePrime

> Cập nhật: 03/09/2026

ADR ghi quyết định lâu dài và lý do. Khi có mâu thuẫn, ADR Accepted mới hơn thắng trong đúng phạm vi phần **Quan hệ với ADR cũ**; không suy rằng toàn bộ ADR cũ mất hiệu lực.

## Trạng thái

- `Accepted`: đang điều khiển thiết kế/code.
- `Partially superseded`: phần không bị ADR mới ghi đè vẫn còn hiệu lực.
- `Superseded`: chỉ giữ để hiểu lịch sử; không dùng làm yêu cầu hiện hành.
- `Proposed`: chưa được chủ sản phẩm chốt.

## Chỉ mục

| ADR | Quyết định | Trạng thái hiện hành |
| --- | --- | --- |
| [0001](0001-database-postgresql.md) | PostgreSQL 16 | Accepted |
| [0002](0002-auth-session-cookie.md) | Web session bằng httpOnly cookie | Accepted; social provider được 0019 sửa |
| [0003](0003-styling-css-modules.md) | AntD token + CSS Modules | Accepted |
| [0004](0004-client-state.md) | Redux; filter ở URL | Accepted |
| [0005](0005-status-enums.md) | Status enum tập trung | Accepted |
| [0006](0006-booking-concurrency.md) | DB constraint chống trùng lịch | Accepted |
| [0007](0007-api-type-contract.md) | Client type sinh từ OpenAPI | Accepted |
| [0008](0008-public-listings-sync.md) | Đồng bộ public listing qua một writer | Accepted |
| [0009](0009-chat-firestore-projection.md) | PostgreSQL là nguồn thật của chat, Firestore là projection | Accepted |
| [0010](0010-billing-plans-subscriptions.md) | Subscription append-only | Accepted; pricing được 0015/0028 sửa |
| [0011](0011-long-term-fixed-packages.md) | Thuê dài hạn theo tháng lịch | Accepted |
| [0012](0012-i18n-shared-url-cookie-locale.md) | i18n vi/en dùng chung URL và message source | Accepted |
| [0013](0013-no-online-payment-mvp.md) | Không online payment ở MVP cũ | **Superseded bởi 0028** |
| [0014](0014-owner-and-shop-single-role.md) | Một role owner/shop, capability từ gói | **Partially superseded bởi 0020/0028** |
| [0015](0015-vehicle-slot-billing.md) | Gói trả trước theo chỗ xe | **Partially superseded bởi 0020/0028** |
| [0016](0016-sepay-bank-reconciliation.md) | SePay đối soát tiền gói | Accepted; phạm vi mở rộng bởi 0022/0028 |
| [0017](0017-native-bearer-auth.md) | Bearer auth cho native | Accepted |
| [0018](0018-map-delivery-distance.md) | Khoảng cách giao xe là ước lượng | Accepted |
| [0019](0019-backend-led-social-oauth.md) | Backend-led OAuth | Accepted |
| [0020](0020-two-revenue-tracks-one-marketplace.md) | Hai tuyến doanh thu trên một chợ | **Partially superseded bởi 0028** |
| [0021](0021-booking-hold-is-the-commission.md) | Hold bằng commission | **Superseded bởi 0028** |
| [0022](0022-sepay-customer-money.md) | Một sổ giao dịch ngân hàng cho các khoản vào | Accepted; mở rộng bởi 0028 |
| [0023](0023-wallet-refund-and-compensation.md) | Ví hoàn/bồi thường cũ | **Superseded bởi 0025/0028** |
| [0024](0024-billing-mode-from-plan-frozen-on-booking.md) | Billing mode đóng băng vào booking | Accepted; breakdown mở rộng bởi 0028 |
| [0025](0025-shop-escrow-hold-and-payout.md) | Tách tiền giữ hộ và payout | **Partially superseded bởi 0028** |
| [0026](0026-first-trips-free-then-commission.md) | Hai chuyến đầu miễn phí | **Superseded bởi 0028** |
| [0027](0027-feature-tiers-basic-owner-vs-shop.md) | Basic Owner và Full Shop capability | Accepted; làm rõ bởi 0028 |
| [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) | Mô hình hiện hành: hai lựa chọn, phí minh bạch, hold/payout có gate | **Accepted** |

## Quy tắc thêm ADR

1. Ghi bối cảnh, quyết định, hệ quả và điều kiện xem lại.
2. Nếu thay đổi quyết định cũ, liệt kê chính xác ADR/phần bị ghi đè.
3. Quyết định về tiền phải nêu chủ sở hữu từng dòng tiền, snapshot, idempotency, audit và reconciliation.
4. Quyết định liên quan thuế/bảo hiểm/thanh toán phải ghi rõ phần nào là giả định và release gate pháp lý.
