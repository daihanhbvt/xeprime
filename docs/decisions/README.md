# Architecture Decision Records — XePrime

> Cập nhật: 02/10/2026

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
| [0002](0002-auth-session-cookie.md) | Web session bằng httpOnly cookie | Accepted; social provider được 0019 sửa; **cookie host-only theo realm + API cùng origin `/api` theo 0053** |
| [0003](0003-styling-css-modules.md) | AntD token + CSS Modules | Accepted |
| [0004](0004-client-state.md) | Redux; filter ở URL | Accepted |
| [0005](0005-status-enums.md) | Status enum tập trung | Accepted; **điều `booking.status` bị 0047 ghi đè một phần** |
| [0006](0006-booking-concurrency.md) | DB constraint chống trùng lịch | Accepted |
| [0007](0007-api-type-contract.md) | Client type sinh từ OpenAPI | Accepted |
| [0008](0008-public-listings-sync.md) | Đồng bộ public listing qua một writer | Accepted; **điều 2 bị 0030 ghi đè** |
| [0009](0009-chat-firestore-projection.md) | PostgreSQL là nguồn thật của chat, Firestore là projection | Accepted |
| [0010](0010-billing-plans-subscriptions.md) | Subscription append-only | Accepted; pricing được 0015/0028 sửa |
| [0011](0011-long-term-fixed-packages.md) | Thuê dài hạn theo tháng lịch | Accepted |
| [0012](0012-i18n-shared-url-cookie-locale.md) | i18n vi/en dùng chung URL và message source | Accepted |
| [0014](0014-owner-and-shop-single-role.md) | Một role owner/shop, capability từ gói | **Partially superseded bởi 0020/0028/0032/0036/0053** — điều 1 còn hiệu lực |
| [0015](0015-vehicle-slot-billing.md) | Gói trả trước theo chỗ xe | **Partially superseded bởi 0020/0028; điều 1/3/8 bị 0041 ghi đè** |
| [0016](0016-sepay-bank-reconciliation.md) | SePay đối soát tiền gói | Accepted; phạm vi mở rộng bởi 0022/0028 |
| [0017](0017-native-bearer-auth.md) | Bearer auth cho native | Accepted; **phiên mang realm theo app (0053)** |
| [0018](0018-map-delivery-distance.md) | Khoảng cách giao xe là ước lượng | Accepted |
| [0019](0019-backend-led-social-oauth.md) | Backend-led OAuth | Accepted; **định danh social unique theo realm, callback web dưới `/api` từng site (0053)** |
| [0020](0020-two-revenue-tracks-one-marketplace.md) | Hai tuyến doanh thu trên một chợ | **Partially superseded bởi 0028; điều 2 + kiểm điểm giao bởi 0029** |
| [0022](0022-sepay-customer-money.md) | Một sổ giao dịch ngân hàng cho các khoản vào | Accepted; mở rộng bởi 0028 |
| [0024](0024-billing-mode-from-plan-frozen-on-booking.md) | Billing mode đóng băng vào booking | Accepted; breakdown mở rộng bởi 0028 |
| [0025](0025-shop-escrow-hold-and-payout.md) | Tách tiền giữ hộ và payout | **Partially superseded bởi 0028/0032; điều 1–4 bị 0033 ghi đè** |
| [0027](0027-feature-tiers-basic-owner-vs-shop.md) | Basic Owner và Full Shop capability | **Partially superseded bởi 0032/0038; điều 3 bị 0038 ghi đè trong phạm vi HẾT GÓI** |
| [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) | Hai lựa chọn, phí minh bạch, hold/payout có gate | **Partially superseded bởi 0032; điều 6 + tên gọi ở điều 8 bị 0033 ghi đè** |
| [0029](0029-per-vehicle-flat-pricing-and-customer-side-fees.md) | Giá gói phẳng theo chỗ; phụ phí chuyến phía khách | **Partially superseded/làm rõ bởi 0032; điều 3 (giá theo chỗ) bị 0041 ghi đè — điều 1–2 (phí phía khách) còn hiệu lực** |
| [0030](0030-locked-identity-fields-instead-of-reapproval.md) | Khoá căn cước xe thay cho "sửa là duyệt lại" | **Accepted; ghi đè 0008 điều 2** |
| [0031](0031-split-feature-api-per-app.md) | Tách tầng gọi API theo app; api-client chỉ còn hạ tầng HTTP | **Accepted; ghi đè 0007 phần tầng feature** |
| [0032](0032-booking-deposit-insurance-and-owner-lite.md) | Cọc booking bắt buộc, bảo hiểm tại bàn giao và ranh giới Owner Lite | **Accepted; ghi đè một phần 0014/0025/0027/0028/0029; vị trí Owner Lite ở điều 6 bị 0053 ghi đè** |
| [0033](0033-money-ledger-and-deposit-allocation.md) | Sổ công nợ "Ví điểm", phân bổ cọc nhiều dòng, định tuyến kết cục | **Accepted; ghi đè một phần 0023/0025/0028; chủ ví ở điều 2 bị 0038 rồi 0053 ghi đè; điều 6 mang các điều còn hiệu lực của 0023** |
| [0034](0034-badge-delivery-by-projection.md) | Huy hiệu đi bằng bản chiếu, không bằng nhịp hỏi lại | **Accepted; mở rộng 0009 sang projection thứ hai** |
| [0035](0035-two-tier-administrative-address.md) | Địa chỉ vật lý theo danh mục hành chính hai cấp (tỉnh → xã/phường/đặc khu) | **Accepted; mở rộng 0018 sang gợi ý địa điểm + ghim có xác nhận** |
| [0036](0036-single-approval-gate-for-commission-owners.md) | Tuyến hoa hồng chỉ có cổng duyệt XE; xác minh gian hàng là trục riêng | **Accepted; ghi đè 0014 điều 5 trong phạm vi tuyến hoa hồng; điều 4 (cổng mua gói) bị 0040 ghi đè** |
| [0037](0037-geoapify-osm-map-provider.md) | Nhà cung cấp bản đồ là Geoapify/OpenStreetMap, không phải Google Maps | **Accepted; ghi đè 0018 ở phần nhà cung cấp + khoá, 0035 điều 6 ở thư viện bản đồ** |
| [0038](0038-owner-track-split-and-unified-wallet.md) | Tách hai tuyến chủ xe: ranh giới Manage chặn ở server (phần ví/khu user bị 0053 thay) | **Partially superseded bởi 0053 (điều 2, 6, 7, 8, 9, 10)**; điều 1, 3, 4, 5, 11–14 còn hiệu lực |
| [0040](0040-registration-track-split.md) | Hai tuyến ĐĂNG KÝ tách hẳn: ý định lưu ở `tenants.onboarding_state`, thanh toán mở Manage, cổng logo chỉ áp tuyến gói | **Accepted; ghi đè 0036 điều 4 (xác minh thôi làm cổng mua gói); nơi đăng ký chuyển sang site partner theo 0053** |
| [0041](0041-plan-tiers-by-vehicle-count.md) | Ba bậc gian hàng bán theo SỐ XE và KỲ HẠN; bậc doanh nghiệp bán bằng tư vấn | **Accepted; ghi đè 0029 điều 3, 0015 điều 1/3/8, và 0038 điều 12 ở phần cách đếm tuyến gói** |
| [0042](0042-confirmed-place-address-for-renters.md) | Địa chỉ có ghim phải được bản đồ xác nhận; bỏ hẳn ô xã/phường ở mọi ô địa chỉ có ghim; tỉnh đã chọn nhớ dùng chung | **Accepted; ghi đè 0035 điều 3 (phần xã/phường) và điều 5** |
| [0043](0043-marketplace-relevance-ranking.md) | Xếp hạng "phù hợp" cho chợ xe: điểm denormalize `rank_score` + ưu tiên địa lý ở trang chủ | **Accepted; mở rộng 0008 (cột dẫn xuất mới), không ghi đè ADR nào** |
| [0044](0044-approve-before-hold.md) | Duyệt trước, thu tiền giữ chỗ sau: cửa sổ 120 phút + hai mốc nhắc, không gia hạn; khung giờ đã mất đóng bằng `slot_taken` | **Accepted; ghi đè TOÀN BỘ 0039, khôi phục 0032 điều 2** |
| [0045](0045-host-cancellation-and-reputation.md) | Chủ xe huỷ được theo từng chặng và lượt huỷ được ghi nhận; ba chỉ số uy tín công khai một nguồn tính; sort mặc định của chợ về `rank_score` + hai vế uy tín/khám phá | **Accepted; mở rộng 0043 (trọng số) và 0044 (điều 7), không ghi đè ADR nào** |
| [0046](0046-platform-funded-promo-codes.md) | Mã khuyến mãi do NỀN TẢNG tài trợ: giảm số khách trả mà không bớt tiền gian hàng; chỉ trừ vào khoản online; lượt dùng GIỮ → CHỐT → NHẢ | **Accepted; mở rộng 0029 điều 1–2, 0032 điều 2, 0033 điều 3–4 và 0044, không ghi đè ADR nào** |
| [0047](0047-booking-status-simplification.md) | Rút gọn `booking.status` còn 5 giá trị thật; endpoint transition công khai chỉ còn huỷ/không-đến; ba tab "Yêu cầu đặt xe"; bỏ ô lọc/cột trạng thái ở "Chờ giao xe"; đổi nhãn `reserved` toàn cục | **Accepted; ghi đè 0005 điều `booking.status`, kích hoạt bởi 0044, không ảnh hưởng ADR khác** |
| [0048](0048-owner-marketplace-visibility.md) | Công tắc hiển thị trên chợ của CHỦ XE là trục thứ ba (`vehicles.marketplace_enabled`), tách hẳn khỏi trạng thái kiểm duyệt; `hidden` là quyết định của NỀN TẢNG và rời khỏi bộ trạng thái gửi duyệt lại; một phép gộp lý do do server suy; công tắc lên cột thao tác đầu hồ sơ xe và việc lên chợ vào thẻ "Việc cần làm" | **Accepted; ghi đè 0005 điều `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`, mở rộng 0008 §2** |
| [0049](0049-vehicle-review-workbench.md) | Màn "Duyệt xe" chỉ nhận phiếu XE; duyệt trên ảnh chụp v2 lúc gửi; nguồn đăng đóng băng lúc gửi và hình chiếu hàng đợi lọc/đếm ở DB; danh mục kiểm tra thủ công là cổng BACKEND của Phê duyệt; mọi ghi lên phiếu khoá dòng; ghi chú nội bộ tách khỏi lý do; tạm ngừng xác minh gian hàng | **Accepted; tạm dừng (không xoá) 0036 điều 3, mở rộng 0008 và 0036 điều 1 & 6** |
| [0050](0050-platform-tenant-support-context.md) | Không gian hỗ trợ gian hàng: phiên có lý do + hạn 45 phút gắn người và phiên đăng nhập; capability do server cấp, endpoint tự khai `@SupportAction` (default-deny); không membership tạm, không giả danh; audit trong phiên luôn phía nền tảng; §13 Đợt 2B: ghi hẹp theo capability + lý do riêng | **Accepted; mở rộng 0002, 0027/0038, 0040; không ghi đè ADR nào** |
| [0051](0051-product-surfaces-web-zones-and-mobile-variants.md) | Ba site web trong MỘT Next app theo host với URL sạch (`xeprime.vn` khách · `partner.xeprime.vn` gian hàng + chủ xe cá nhân · `admin.xeprime.vn`), tiền tố `/manage`/`/admin` chỉ là thư mục nội bộ; API cùng origin dưới `/api` từng site; hai app mobile (hai Expo project + `shared`); một API/DB/repo; web không giữ trạng thái riêng | **Accepted (viết lại 02/10/2026); ghi đè 0032 điều 6 và 0040 ở vị trí Owner Lite; đi cùng 0053** |
| [0052](0052-branch-filter-per-screen.md) | Lọc chi nhánh theo TỪNG MÀN và sống trên URL, không còn bộ chọn chung ở thanh trên (`vehicles` là bảng duy nhất mang `branch_id`); 10 màn gồm cả Công nợ · Thu chi · Doanh thu · Tổng quan; dải chỉ số và số trên tab đi cùng phạm vi với bảng; sổ thu chi phải NÓI RA số khoản chung bị bỏ lại (`unassignedCount`), không tự phân bổ; nhớ chi nhánh gần nhất nhưng URL luôn thắng; huy hiệu menu đếm toàn gian hàng; `resolveBranchScope()` là chỗ duy nhất sẽ nhận phép giao khi làm phân quyền theo chi nhánh | **Accepted; mở rộng 0004; không ghi đè ADR nào** |
| [0053](0053-separate-account-realms.md) | Ba không gian tài khoản tách biệt `customer` · `partner` · `platform`: unique theo realm (cùng SĐT/email/Google tạo được tài khoản riêng mỗi site), phiên host-only theo realm, realm do proxy quyết, mọi route khai realm; một nhân viên một gian hàng; chặn tự đặt xe xuyên realm bằng SĐT đã xác minh; ví theo tài khoản, vẫn một DB; admin không tự đăng ký, không bắt 2FA | **Accepted; ghi đè một phần 0002, 0014, 0019, 0032 điều 6, 0033 điều 2, 0038 điều 2/6–10, 0040; mở rộng 0017** |

## ADR đã gỡ khỏi repo

Gỡ ngày 02/10/2026 vì đã bị thay **toàn bộ**. Số hiệu không dùng lại. Bản gốc còn trong lịch sử git
(`git log --diff-filter=D -- docs/decisions/<file>`). Code, migration hay tài liệu khác còn nhắc tới
các số này thì đọc ADR thay thế ở cột cuối.

| ADR | Quyết định cũ | Thay bởi |
| --- | --- | --- |
| 0013 | Không thanh toán online ở MVP | 0028 |
| 0021 | Khoản giữ chỗ chính là hoa hồng | 0028, 0032, 0033 |
| 0023 | Ví hoàn/bồi thường cũ | 0033 (điều 6 chép các điều còn hiệu lực: sổ chỉ ghi thêm, `balance` lưu sẵn, một bộ bảng cho mọi chủ ví, chụp thông tin ngân hàng khi rút, `WalletService` là writer duy nhất) |
| 0026 | Hai chuyến đầu miễn phí | 0028 |
| 0039 | Thu giữ chỗ TRƯỚC khi duyệt | 0044 (gồm cách nhận ra dữ liệu LEGACY: `decided_at IS NULL`) |

## Quy tắc thêm ADR

1. Ghi bối cảnh, quyết định, hệ quả và điều kiện xem lại.
2. Nếu thay đổi quyết định cũ, liệt kê chính xác ADR/phần bị ghi đè.
3. Quyết định về tiền phải nêu chủ sở hữu từng dòng tiền, snapshot, idempotency, audit và reconciliation.
4. Quyết định liên quan thuế/bảo hiểm/thanh toán phải ghi rõ phần nào là giả định và release gate pháp lý.
