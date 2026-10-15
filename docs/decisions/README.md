# Architecture Decision Records — XePrime

> Cập nhật: 14/10/2026

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
| [0005](0005-status-enums.md) | Status enum tập trung | Accepted; **điều `booking.status` bị 0047 ghi đè một phần; `VEHICLE_PUBLIC_STATUS_SUBMITTABLE` bị 0048 ghi đè** |
| [0006](0006-booking-concurrency.md) | DB constraint chống trùng lịch | Accepted |
| [0007](0007-api-type-contract.md) | Client type sinh từ OpenAPI | Accepted; **phần tầng gọi API theo feature bị 0031 ghi đè** (contract-first giữ nguyên) |
| [0008](0008-public-listings-sync.md) | Đồng bộ public listing qua một writer | Accepted; **điều 2 bị 0030 ghi đè** |
| [0009](0009-chat-firestore-projection.md) | PostgreSQL là nguồn thật của chat, Firestore là projection | Accepted |
| [0010](0010-billing-plans-subscriptions.md) | Subscription append-only | Accepted; kỳ hạn tháng lịch + pricing theo 0028/0041 (0041 gỡ `plans.price`/`duration_days`/`max_vehicles`) |
| [0011](0011-long-term-fixed-packages.md) | Thuê dài hạn theo tháng lịch | Accepted |
| [0012](0012-i18n-shared-url-cookie-locale.md) | i18n vi/en dùng chung URL và message source | Accepted |
| [0014](0014-owner-and-shop-single-role.md) | Một role owner/shop, capability từ gói | **Partially superseded — điều 1–4 còn hiệu lực**; điều 5 phần lớn bị 0028/0032/0036 thay; giả định một người một tài khoản bị 0053 thay |
| [0016](0016-sepay-bank-reconciliation.md) | SePay đối soát tiền gói | Accepted; phạm vi mở rộng bởi 0022/0028 |
| [0017](0017-native-bearer-auth.md) | Bearer auth cho native | Accepted; **phiên mang realm theo app (0053)** |
| [0018](0018-map-delivery-distance.md) | Khoảng cách giao xe là ước lượng | **Partially superseded bởi 0061** (nhà cung cấp + khoá; trước đó 0037); mọi quyết định sản phẩm còn hiệu lực |
| [0019](0019-backend-led-social-oauth.md) | Backend-led OAuth | Accepted; **định danh social unique theo realm, callback web dưới `/api` từng site (0053)**; **§8: dòng "SĐT + OTP" và "Khách vãng lai đặt xe" bị 0060 gỡ, đăng ký cần `code`** |
| [0022](0022-sepay-customer-money.md) | Một sổ giao dịch ngân hàng cho các khoản vào | Accepted; mở rộng bởi 0028 |
| [0024](0024-billing-mode-from-plan-frozen-on-booking.md) | Billing mode đóng băng vào booking | **Partially superseded — điều 3 (không gói ⇒ `package`) bị 0038 điều 1 ghi đè** (`unconfigured`, `resolveEffectiveBilling`); nguồn ở điều 1 nay là `resolveEffectiveBilling`; breakdown mở rộng bởi 0028 |
| [0025](0025-shop-escrow-hold-and-payout.md) | Tách tiền giữ hộ và payout | **Partially superseded bởi 0028/0032; điều 1–4 bị 0033 ghi đè; cam kết rút tối đa ở điều 7 hạ 3 → 2 ngày làm việc (0028 điều 8)** |
| [0027](0027-feature-tiers-basic-owner-vs-shop.md) | Basic Owner và Full Shop capability | **Partially superseded bởi 0032/0038; điều 3 bị 0038 ghi đè trong phạm vi HẾT GÓI; điều 6 hết đối tượng (0026 đã gỡ); mục "Hệ quả về giá trên chợ" bị 0028 điều 10 + 0029 điều 1 thay** |
| [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) | Hai lựa chọn, phí minh bạch, hold/payout có gate | **Partially superseded** — điều 1 (cột theo số chỗ) và điều 2 bị 0029 rồi 0041 thay; điều 6 + tên gọi ở điều 8 bị 0033 ghi đè; điều 7 (phương án B) bị 0032 điều 2 thay; **điều 3, 4, 5, 9, 10 + release gate còn hiệu lực** |
| [0029](0029-per-vehicle-flat-pricing-and-customer-side-fees.md) | Giá gói phẳng theo chỗ; phụ phí chuyến phía khách | **Partially superseded — điều 3 (giá theo chỗ) bị 0041 ghi đè; điều 2 được 0032 làm rõ (thuế phía chủ xe); điều 1, 4 còn hiệu lực** |
| [0030](0030-locked-identity-fields-instead-of-reapproval.md) | Khoá căn cước xe thay cho "sửa là duyệt lại" | **Accepted; ghi đè 0008 điều 2** |
| [0031](0031-split-feature-api-per-app.md) | Tách tầng gọi API theo app; api-client chỉ còn hạ tầng HTTP | **Accepted; ghi đè 0007 phần tầng feature** |
| [0032](0032-booking-deposit-insurance-and-owner-lite.md) | Cọc booking bắt buộc, bảo hiểm tại bàn giao và ranh giới Owner Lite | **Accepted; ghi đè một phần 0014/0025/0027/0028/0029; vị trí Owner Lite ở điều 6 bị 0053 ghi đè; mốc "đặt xe thành công" ở điều 2 bị 0044 điều 2 thay; quyền admin vào Manage ở điều 6 bị 0050 thay; tên "Số dư XePrime" đổi thành "Ví điểm" theo 0033 điều 1** |
| [0033](0033-money-ledger-and-deposit-allocation.md) | Sổ công nợ "Ví điểm", phân bổ cọc nhiều dòng, định tuyến kết cục | **Accepted; ghi đè một phần 0023/0025/0028; chủ ví ở điều 2 bị 0038 rồi 0053 ghi đè; điều 6 mang các điều còn hiệu lực của 0023; lý do "luôn có khách vãng lai" ở điều 5 thu hẹp bởi 0060** |
| [0034](0034-badge-delivery-by-projection.md) | Huy hiệu đi bằng bản chiếu, không bằng nhịp hỏi lại | **Accepted; mở rộng 0009 sang projection thứ hai** |
| [0035](0035-two-tier-administrative-address.md) | Địa chỉ vật lý theo danh mục hành chính hai cấp (tỉnh → xã/phường/đặc khu) | **Accepted; mở rộng 0018 sang gợi ý địa điểm + ghim có xác nhận; điều 6 bị 0061 ghi đè ở phần bản đồ (web không còn bản đồ); điều 3 (xã/phường) và 5 bị 0042 ghi đè ở ô địa chỉ có ghim** |
| [0036](0036-single-approval-gate-for-commission-owners.md) | Tuyến hoa hồng chỉ có cổng duyệt XE; xác minh gian hàng là trục riêng | **Accepted; ghi đè 0014 điều 5 trong phạm vi tuyến hoa hồng; điều 4 (cổng mua gói) bị 0040 ghi đè; điều 3 (trục xác minh gian hàng) bị 0049 tạm dừng** |
| [0037](0037-geoapify-osm-map-provider.md) | Nhà cung cấp bản đồ là Geoapify/OpenStreetMap, không phải Google Maps | **Superseded bởi 0061** — giữ để đọc mã `gp1:` trong dữ liệu cũ (điều 5); ý định điều 6 chép sang 0061 điều 5 |
| [0038](0038-owner-track-split-and-unified-wallet.md) | Tách hai tuyến chủ xe: ranh giới Manage chặn ở server (phần ví/khu user bị 0053 thay) | **Partially superseded bởi 0053 (điều 2, 6–10); điều 12 phần cách đếm tuyến gói bị 0041 ghi đè**; ghi đè 0024 điều 3; điều 1, 3, 4, 5, 11, 13, 14 còn hiệu lực |
| [0040](0040-registration-track-split.md) | Hai tuyến ĐĂNG KÝ tách hẳn: ý định lưu ở `tenants.onboarding_state`, thanh toán mở Manage, cổng logo chỉ áp tuyến gói | **Accepted; ghi đè 0036 điều 4 (xác minh thôi làm cổng mua gói); nơi đăng ký chuyển sang site partner theo 0053** |
| [0041](0041-plan-tiers-by-vehicle-count.md) | Ba bậc gian hàng bán theo SỐ XE và KỲ HẠN; bậc doanh nghiệp bán bằng tư vấn | **Accepted; ghi đè 0029 điều 3, 0015 (đã gỡ) điều 1/3/8, và 0038 điều 12 ở phần cách đếm tuyến gói; điều 9 chép các điều còn hiệu lực của 0015** |
| [0042](0042-confirmed-place-address-for-renters.md) | Địa chỉ có ghim phải được bản đồ xác nhận; bỏ hẳn ô xã/phường ở mọi ô địa chỉ có ghim; tỉnh đã chọn nhớ dùng chung | **Accepted; ghi đè 0035 điều 3 (phần xã/phường) và điều 5; điều 1 (nguồn "đặt ghim"), 2 (bắt buộc toạ độ) và 5 (bản đồ mở ở đâu) bị 0061 ghi đè** |
| [0043](0043-marketplace-relevance-ranking.md) | Xếp hạng "phù hợp" cho chợ xe: điểm denormalize `rank_score` + ưu tiên địa lý ở trang chủ | **Accepted; mở rộng 0008 (cột dẫn xuất mới), không ghi đè ADR nào** |
| [0044](0044-approve-before-hold.md) | Duyệt trước, thu tiền giữ chỗ sau: cửa sổ 120 phút + hai mốc nhắc, không gia hạn; khung giờ đã mất đóng bằng `slot_taken` | **Accepted; ghi đè TOÀN BỘ 0039, khôi phục 0032 điều 2 (nhưng đơn thuê chỉ ra đời khi đối soát đủ tiền, không phải lúc `acceptedAt`); phần dữ liệu LEGACY 0039 được 0055 gỡ hẳn** |
| [0045](0045-host-cancellation-and-reputation.md) | Chủ xe huỷ được theo từng chặng và lượt huỷ được ghi nhận; ba chỉ số uy tín công khai một nguồn tính; sort mặc định của chợ về `rank_score` + hai vế uy tín/khám phá | **Accepted; mở rộng 0043 (trọng số) và 0044 (điều 7), không ghi đè ADR nào** |
| [0046](0046-platform-funded-promo-codes.md) | Mã khuyến mãi do NỀN TẢNG tài trợ: giảm số khách trả mà không bớt tiền gian hàng; chỉ trừ vào khoản online; lượt dùng GIỮ → CHỐT → NHẢ | **Accepted; mở rộng 0029 điều 1–2, 0032 điều 2, 0033 điều 3–4 và 0044, không ghi đè ADR nào; cách khách vãng lai có danh tính ở điều 5 cập nhật bởi 0060** |
| [0047](0047-booking-status-simplification.md) | Rút gọn `booking.status` còn 5 giá trị thật; endpoint transition công khai chỉ còn huỷ/không-đến; ba tab "Yêu cầu đặt xe"; bỏ ô lọc/cột trạng thái ở "Chờ giao xe"; đổi nhãn `reserved` toàn cục | **Accepted; ghi đè 0005 điều `booking.status`, kích hoạt bởi 0044, không ảnh hưởng ADR khác** |
| [0048](0048-owner-marketplace-visibility.md) | Công tắc hiển thị trên chợ của CHỦ XE là trục thứ ba (`vehicles.marketplace_enabled`), tách hẳn khỏi trạng thái kiểm duyệt; `hidden` là quyết định của NỀN TẢNG và rời khỏi bộ trạng thái gửi duyệt lại; một phép gộp lý do do server suy; công tắc lên cột thao tác đầu hồ sơ xe và việc lên chợ vào thẻ "Việc cần làm" | **Accepted; ghi đè 0005 điều `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`, mở rộng 0008 §2** |
| [0049](0049-vehicle-review-workbench.md) | Màn "Duyệt xe" chỉ nhận phiếu XE; duyệt trên ảnh chụp v2 lúc gửi; nguồn đăng đóng băng lúc gửi và hình chiếu hàng đợi lọc/đếm ở DB; danh mục kiểm tra thủ công là cổng BACKEND của Phê duyệt; mọi ghi lên phiếu khoá dòng; ghi chú nội bộ tách khỏi lý do; tạm ngừng xác minh gian hàng | **Accepted; tạm dừng (không xoá) 0036 điều 3, mở rộng 0008 và 0036 điều 1 & 6** |
| [0050](0050-platform-tenant-support-context.md) | Không gian hỗ trợ gian hàng: phiên có lý do + hạn 45 phút gắn người và phiên đăng nhập; capability do server cấp, endpoint tự khai `@SupportAction` (default-deny); không membership tạm, không giả danh; audit trong phiên luôn phía nền tảng; §13 Đợt 2B: ghi hẹp theo capability + lý do riêng | **Accepted; mở rộng 0002, 0027/0038, 0040; thay gạch đầu dòng "admin vào Manage với quyền như chủ gian hàng" ở 0032 điều 6** |
| [0051](0051-product-surfaces-web-zones-and-mobile-variants.md) | Ba site web trong MỘT Next app theo host với URL sạch (`xeprime.vn` khách · `partner.xeprime.vn` gian hàng + chủ xe cá nhân · `admin.xeprime.vn`), tiền tố `/manage`/`/admin` chỉ là thư mục nội bộ; API cùng origin dưới `/api` từng site; hai app mobile (hai Expo project + `shared`); một API/DB/repo; web không giữ trạng thái riêng | **Accepted (viết lại 02/10/2026); ghi đè 0032 điều 6 và 0040 ở vị trí Owner Lite; đi cùng 0053** |
| [0052](0052-branch-filter-per-screen.md) | Lọc chi nhánh theo TỪNG MÀN và sống trên URL, không còn bộ chọn chung ở thanh trên (`vehicles` là bảng duy nhất mang `branch_id`); 10 màn gồm cả Công nợ · Thu chi · Doanh thu · Tổng quan; dải chỉ số và số trên tab đi cùng phạm vi với bảng; sổ thu chi phải NÓI RA số khoản chung bị bỏ lại (`unassignedCount`), không tự phân bổ; nhớ chi nhánh gần nhất nhưng URL luôn thắng; huy hiệu menu đếm toàn gian hàng; `resolveBranchScope()` là chỗ duy nhất sẽ nhận phép giao khi làm phân quyền theo chi nhánh | **Accepted; mở rộng 0004; không ghi đè ADR nào** |
| [0053](0053-separate-account-realms.md) | Ba không gian tài khoản tách biệt `customer` · `partner` · `platform`: unique theo realm (cùng SĐT/email/Google tạo được tài khoản riêng mỗi site), phiên host-only theo realm, realm do proxy quyết, mọi route khai realm; một nhân viên một gian hàng; chặn tự đặt xe xuyên realm bằng SĐT đã xác minh; ví theo tài khoản, vẫn một DB; admin không tự đăng ký, không bắt 2FA | **Accepted; ghi đè một phần 0002, 0014, 0019, 0032 điều 6, 0033 điều 2, 0038 điều 2/6–10, 0040; mở rộng 0017; gạch `customer`/`partner` ở điều 3 bị 0060 ghi đè** |
| [0054](0054-personal-storefront-uses-account-identity.md) | Mặt tiền CÁ NHÂN (tuyến hoa hồng) hiện bằng danh tính TÀI KHOẢN chủ — họ tên, SĐT/email đăng nhập ĐÃ XÁC THỰC, ảnh đại diện; mặt tiền GIAN HÀNG giữ bộ riêng (`tenants.name/phone/email`, logo). Suy lúc ĐỌC theo tuyến hiệu lực (`storefrontIdentity` · `resolveStorefront`), không chép khi đổi tuyến — lên gói bộ riêng hiện lại, hết gói tự về tài khoản | **Accepted; ghi đè một phần 0040 (SĐT liên hệ trong phạm vi tuyến hoa hồng); mở rộng 0028/0038, 0053** |
| [0055](0055-retire-pay-before-approve-states.md) | Gỡ hẳn `hold_paid` / `approved_by_host` (yêu cầu) và `pending_approval_paid` (chặng chuyến): DB từ chối bằng CHECK `booking_requests_status_valid`, `awaiting_hold` bắt buộc có `decided_at`; tiền về đi thẳng `awaiting_hold → converted_to_booking` và KHÔNG ghi đè ba cột quyết định; hằng số còn trong `@xeprime/types` chỉ để mobile biên dịch | **Accepted; hoàn tất phần LEGACY 0039 mà 0044 tạm giữ; mở rộng 0005, 0045 điều 3** |
| [0056](0056-host-sees-customer-contact.md) | Chủ xe thấy liên hệ của khách theo MỘT luật (`hostSeesCustomerContact`): tuyến gói luôn thấy, tuyến hoa hồng chỉ khi đã có ĐƠN; hộp thư + trang chuyến cùng đi qua cổng; sổ khách chặn tuyến hoa hồng ở server; chặng "Quá hạn phản hồi" tách khỏi "Bị từ chối" | **Accepted; làm rõ 0028 điều 9, mở rộng 0027 điều 1** |
| [0057](0057-customer-driver-licence-verification.md) | Bằng lái của tài khoản khách: nộp ảnh một lần, máy đọc (Tesseract tại chỗ, không bên thứ ba) tự xác thực GPLX Việt Nam khi đủ điều kiện (còn lại — kể cả bằng quốc tế/nước ngoài — chờ người duyệt), cổng chặn lúc gửi yêu cầu thuê tự lái/dài hạn theo hạng + hạn cho CHÍNH chuyến; khách vãng lai đăng nhập bằng OTP trước bước bằng lái | **Accepted; mở rộng 0044 (thêm điều kiện trước khi gửi) và 0053 điều 7; câu cuối điều 4 + bước OTP đăng nhập ở điều 5 bị 0060 thay** |
| [0058](0058-momo-vnpay-payment-gateways.md) | MoMo và VNPAY là phương thức thanh toán BỔ SUNG cho chuyển khoản SePay: sổ riêng `payment_gateway_orders` (không ghi giả vào `bank_transactions`), một đường tiền chung với SePay (`applyBankPaymentWithinTx`), chỉ IPN có chữ ký hoặc truy vấn phía server đổi được tiền, không tự hoàn; mặc định tắt, production từ chối boot khi bật cổng cho bất kỳ luồng nào cho tới khi Accepted | **Proposed; mở rộng 0016/0022 (nhiều nhà cung cấp), không ghi đè ADR nào; còn mở Q1–Q8** |
| [0059](0059-vat-invoice-support-setting.md) | "Có hỗ trợ xuất hoá đơn VAT" là THÔNG TIN gian hàng / chủ xe công bố cho MỌI xe (`tenants.vat_invoice_supported`, mặc định `false`); chợ JOIN `tenants`, không chép sang `public_listings`; khách lọc + thấy dấu hiệu; hoá đơn do chủ xe xuất cho tiền thuê, XePrime không xuất thay và không đổi giá/phí/thuế/đặt xe; `PATCH /tenants/current/vat-invoice` lưu ngay, áp như nhau hai tuyến (Chính sách thuê · Hồ sơ chủ xe), không mở cho phiên hỗ trợ | **Accepted; áp dụng 0008 §3 cho một cột tenant mới, không ghi đè ADR nào** |
| [0060](0060-phone-login-and-account-required-booking.md) | Site khách và site partner đăng nhập bằng SĐT + mật khẩu (email ⇒ `PHONE_LOGIN_REQUIRED`) hoặc Google/Facebook; đăng ký xác minh OTP ngay; OTP CHỈ xác minh — đăng nhập OTP trả 410 `OTP_LOGIN_RETIRED`, không endpoint nào tạo tài khoản/cấp phiên vì một mã đúng; quên mật khẩu bằng OTP không lộ số tồn tại và không cấp phiên; tài khoản chưa xác minh SĐT qua cổng bắt buộc; gửi yêu cầu thuê cần tài khoản khách, danh tính đọc từ tài khoản; bản nháp đặt xe ở `sessionStorage`, đi tiếp sau đăng nhập nhưng không tự gửi; mời thành viên bằng SĐT + liên kết trả cho người mời; chuẩn hoá `users.phone` | **Accepted; ghi đè 0019 §8 (hai dòng), 0053 điều 3 (`customer`/`partner`), 0057 điều 4–5 (phần khách chưa đăng nhập); cập nhật 0033 điều 5, 0046 điều 5** |
| [0061](0061-vietmap-geo-provider.md) | Vietmap cho gợi ý địa chỉ + quãng đường; web KHÔNG vẽ bản đồ (Google Maps Platform bị loại: Việt Nam nằm trong Prohibited Territories; Map4D viết xong nhưng không merge). Chi phí theo giao dịch là ràng buộc thiết kế: cầu dao lượt gọi theo ngày, cache gợi ý 10 phút, cache Place theo mã + cache DB 90 ngày, Route 2 điểm, báo giá dùng toạ độ đã chọn; vị trí trên trang xe là liên kết mở Google Maps; một khoá server giới hạn IP; địa chỉ chưa có trong gợi ý đi đường "dùng đúng địa chỉ đã nhập" (server tự tra toạ độ); nhà cung cấp hỏng ⇒ nhập tay; app native chuyển sau | **Accepted; ghi đè TOÀN BỘ 0037, 0018 ở nhà cung cấp + khoá, 0035 điều 6 ở phần bản đồ, 0042 điều 1/2/5; còn mở Q1–Q4 (điều khoản lưu trữ, giá, hình lỗi thật, giới hạn trial)** |

## ADR đã gỡ khỏi repo

Gỡ vì đã bị thay **toàn bộ** — 0013, 0021, 0023, 0026, 0039 ngày 02/10/2026; 0015, 0020 ngày
06/10/2026. Số hiệu không dùng lại. Bản gốc còn trong lịch sử git
(`git log --diff-filter=D -- docs/decisions/<file>`). Code, migration hay tài liệu khác còn nhắc tới
các số này thì đọc ADR thay thế ở cột cuối.

| ADR | Quyết định cũ | Thay bởi |
| --- | --- | --- |
| 0013 | Không thanh toán online ở MVP | 0028 |
| 0015 | Gói trả trước theo CHỖ xe; kỳ hạn tháng lịch; hết hạn gỡ xe khỏi chợ | 0041 (điều 9 chép các điều còn hiệu lực: kỳ hạn tháng lịch qua `addCalendarMonthsVn` + CHECK `term_months` ∈ 1/3/6/12, hoá đơn gói chụp từng dòng với `BillingService` là writer, ranh giới dữ liệu/quy tắc), 0022 (điều 6: không nối `payments.subscription_id`), 0038, 0040 |
| 0020 | Hai tuyến doanh thu trên một chợ: hoa hồng trừ phía chủ xe, gói theo chỗ, không boost theo tuyến | 0028, 0029, 0038 (+ 0024 điều 6: hết gói về hoa hồng, xe ở lại chợ; 0041; 0045) |
| 0021 | Khoản giữ chỗ chính là hoa hồng | 0028, 0032, 0033 |
| 0023 | Ví hoàn/bồi thường cũ | 0033 (điều 6 chép các điều còn hiệu lực: sổ chỉ ghi thêm, `balance` lưu sẵn, một bộ bảng cho mọi chủ ví, chụp thông tin ngân hàng khi rút, `WalletService` là writer duy nhất) |
| 0026 | Hai chuyến đầu miễn phí | 0028 |
| 0039 | Thu giữ chỗ TRƯỚC khi duyệt | 0044 (gồm cách nhận ra dữ liệu LEGACY: `decided_at IS NULL`) |

## Quy tắc thêm ADR

1. Ghi bối cảnh, quyết định, hệ quả và điều kiện xem lại.
2. Nếu thay đổi quyết định cũ, liệt kê chính xác ADR/phần bị ghi đè.
3. Quyết định về tiền phải nêu chủ sở hữu từng dòng tiền, snapshot, idempotency, audit và reconciliation.
4. Quyết định liên quan thuế/bảo hiểm/thanh toán phải ghi rõ phần nào là giả định và release gate pháp lý.
