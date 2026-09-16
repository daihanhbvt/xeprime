Bạn đang làm việc trực tiếp trong repository XePrime. Hãy triển khai hoàn chỉnh task dưới đây trong một lượt: tự kiểm tra kiến trúc hiện tại, sửa schema/API/web, tạo migration, cập nhật generated types/translations/tests và chạy kiểm chứng. Không chỉ phân tích hoặc viết kế hoạch. Không hỏi lại nếu câu trả lời có thể xác minh từ source code.

# 1. Quy tắc làm việc

1. Đọc đầy đủ `CLAUDE.md`, `AGENTS.md` và ADR/instruction liên quan trước khi sửa.
2. Kiểm tra `git status`. Worktree có thể chứa thay đổi chưa commit từ task trước: không reset, checkout, revert hoặc ghi đè thay đổi hiện có.
3. Đọc implementation thực tế; không giả định file vẫn giống phiên bản cũ.
4. Không commit hoặc push.
5. Không thêm UI library. Dùng Ant Design, component, CSS module và design token hiện có.
6. Không hard-code text nếu project đang dùng `next-intl`; cập nhật đầy đủ locale Việt/Anh.
7. Dùng generator chính thức cho Prisma/OpenAPI/API client/types; không sửa generated files thủ công.
8. Repository chỉ đang development, chưa production. Dữ liệu dev của hồ sơ shop, owner contact, bank account legacy và SellerProfile có thể mất hoặc nhập lại. Được phép drop cột legacy bằng migration.
9. Không xóa hoặc làm hỏng booking, booking request, booking hold, bank transaction, wallet ledger, withdrawal, payment/refund, subscription invoice, webhook SePay hoặc invariant tài chính.
10. Task này không thay đổi công thức tiền, giá gói, đối soát SePay hoặc lifecycle booking hold.

# 2. Mục tiêu sản phẩm

Sidebar Manage không còn:

- Gói & hóa đơn.
- Tài khoản & bảo mật.
- Hồ sơ người bán.

Sidebar chỉ giữ một mục `Cửa hàng` cho các nội dung:

1. Thông tin hiển thị.
2. Chủ gian hàng.
3. Địa chỉ & pháp lý.
4. Tài khoản nhận tiền.
5. Gói & hạn mức.
6. Hóa đơn thanh toán nằm bên trong Gói & hạn mức.

Mật khẩu, phương thức đăng nhập và xóa tài khoản chuyển sang `/manage/security`. Trang Security không nằm trong sidebar; truy cập từ dropdown người dùng/workspace.

“Xóa Gói & hóa đơn” nghĩa là xóa menu/page độc lập về mặt trải nghiệm. Không xóa invoice, QR thanh toán hoặc lịch sử thanh toán.

# 3. Nguồn dữ liệu canonical

Phải có đúng một nguồn sự thật cho từng loại dữ liệu. Không triển khai dual-write.

## 3.1. Nhận diện gian hàng

Nguồn canonical:

```text
TenantProfile.displayName
TenantProfile.bio
TenantProfile.logoUrl
TenantProfile.coverUrl
```

Logo shop là hình ảnh đại diện duy nhất trong Manage. Không copy giữa `TenantProfile.logoUrl` và `User.avatarUrl`.

Giữ `User.avatarUrl` trong database cho marketplace/tài khoản khách thuê, nhưng không hiển thị hoặc cho chỉnh avatar cá nhân trong Manage.

## 3.2. Chủ gian hàng

Nguồn canonical là `Tenant.ownerUserId → User`.

API shop trả object rõ nghĩa:

```ts
ownerAccount: {
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}
```

Xóa nguồn legacy:

```text
tenant_profiles.owner_full_name
tenant_profiles.owner_email
tenant_profiles.owner_phone
```

Tạo migration drop ba cột trên và xóa mọi DTO/form/type/translation/runtime reference.

Shop verification phải dùng owner User. Khi submit review:

- Validate owner name và owner phone từ User.
- Snapshot owner name/email/phone tại thời điểm submit.
- Reviewer đọc snapshot, không đọc giá trị live làm thay đổi hồ sơ đã gửi.

Permission:

- Owner sửa display name của chính mình.
- Đổi email/SĐT qua verification/OTP hiện có.
- Manager/staff chỉ đọc owner account.
- Không cho manager sửa User của owner bằng quyền tenant update.
- Sau khi owner đổi email/SĐT, trang Shop invalidate/refetch và cập nhật ngay.
- Không ghi bản sao sang TenantProfile.

UI gọi section là `Chủ gian hàng`. Mô tả đây là tài khoản chủ sở hữu, không tự tuyên bố là người đại diện pháp luật.

## 3.3. Tài khoản nhận tiền

Nguồn canonical duy nhất là `bank_accounts` qua `/shop/bank-accounts`.

Tái sử dụng nếu phù hợp:

```text
BankAccountList
BankAccountForm
useBankAccounts
scope="shop"
```

Drop khỏi TenantProfile:

```text
bank_name
bank_account_no
bank_account_name
qr_url
```

Không cần migrate dữ liệu dev cũ.

Nếu SellerProfile có các field sau thì drop và xóa khỏi schema/DTO/service/form/admin drawer:

```text
bank_code
bank_account_number
bank_account_name
```

Cập nhật SellerProfile completion validation để không yêu cầu bank account.

Trang Shop và WithdrawDialog phải dùng cùng bank account query/cache. Thêm, archive hoặc đổi default tại Shop phải phản ánh trong dialog rút tiền mà không reload.

Không log số tài khoản đầy đủ hoặc đưa bank data vào URL.

## 3.4. Gói và hóa đơn

Giữ nguồn canonical hiện có: tenant subscription, subscription invoice và API subscription. Không thay đổi phép tính giá hoặc xử lý tiền.

## 3.5. SellerProfile

Loại Hồ sơ người bán khỏi trải nghiệm chủ shop:

- Xóa nav item.
- Xóa page/form Manage.
- Xóa CTA/link.
- Route cũ redirect.

Không xóa phần backend còn được tax/admin dùng:

- SellerProfile table.
- Entity type, legal name, tax ID, ID number.
- Status và approval target.
- Tax withholding relation.
- Platform admin reviewer.
- Notification/status backend.

SellerProfile có thể tồn tại dormant cho tương lai.

Ẩn SellerProfile không được làm Wallet, withdrawal, payment settings hoặc tax module lỗi. Nếu WalletSummaryCard chỉ gọi SellerProfile để hiện badge xác minh, bỏ badge hoặc làm optional nhưng không thay đổi balance/withdrawal.

Không xóa `seller_profile.*` permissions nếu deposit/payment settings còn dùng.

# 4. Menu và route

Xóa khỏi `SHOP_NAV`:

```text
subscription
account
seller-profile
```

Nếu `account-billing` rỗng thì xóa section. Không khóa cứng tổng số menu item trong test.

Tạo route:

```text
/manage/security
```

Redirect:

```text
/manage/subscription → /manage/shop?section=plan
/manage/account → /manage/security
/manage/shop/seller-profile → /manage/shop?section=legal
```

Giữ:

```text
/manage/account/trips
/manage/account/trips/:id
```

Nếu lối `Chuyến tôi đi thuê` từng nằm trong Account page, chuyển vào dropdown Manage khi phù hợp.

Cập nhật `shop-account-gate`:

- Shop member vào `/account`, `/account/change-password`, `/account/delete-account` → `/manage/security`.
- Account subscription phù hợp → `/manage/shop?section=plan`.
- Không phá `/account` của người không thuộc shop.

Cập nhật routes, breadcrumbs, metadata, active nav, MarketHeader, ManageUserCard và tests.

# 5. Thiết kế trang Cửa hàng

Giao diện phải hiện đại, sạch, gọn, ít chữ và có phân cấp rõ.

Không:

- Card lồng Card rườm rà.
- Alert full-width khi không có action.
- Empty state khổng lồ.
- Khoảng trắng vô nghĩa.
- Quá nhiều màu/icon.
- Form kéo rộng toàn màn hình.
- Progress đỏ cho quota hợp lệ.
- Hard-code màu/text.

Định hướng:

```text
max-width: 1180–1280px
section gap: 24px
card padding desktop: 20–24px
card padding mobile: 16px
```

## 5.1. Header

```text
[Logo] Việt Car Hà Nội    ● Đang hoạt động

Thông tin và thiết lập của gian hàng.

                                  [Xem gian hàng] [Lưu thay đổi]
```

- Logo 48–56px.
- Tên shop là `h1`.
- Status tag nhỏ.
- Save chỉ active khi profile form dirty.
- Không đặt Thêm xe trong banner verification.
- Shop đã verified thì chỉ cần status tag; chỉ hiện alert khi có blocker/action.

## 5.2. Điều hướng section

Desktop dùng layout hai cột:

- Trái 200–230px, sticky.
- Phải là nội dung.

Menu nội bộ:

```text
Thông tin hiển thị
Chủ gian hàng
Địa chỉ & pháp lý
Tài khoản nhận tiền
Gói & hạn mức
```

Mobile dùng select hoặc horizontal tabs scroll được.

Query:

```text
?section=profile
?section=owner
?section=legal
?section=payout
?section=plan
```

Yêu cầu:

- Reload/back/forward hoạt động.
- Query invalid fallback `profile`.
- Scroll/focus đúng section.
- Không làm mất form chưa lưu khi đổi section.
- Có heading/id/accessibility đúng.

## 5.3. Thông tin hiển thị

Card gồm tên hiển thị, giới thiệu, logo và cover.

Desktop: tên/bio full-width, logo và cover cùng hàng. Logo upload nhỏ, cover preview rộng. Mobile stack dọc.

## 5.4. Chủ gian hàng

```text
Chủ gian hàng

Phạm Đức Việt
owner.hanoi@xeprime.test       ✓ Đã xác minh
0903 000 001                   ✓ Đã xác minh

Thông tin lấy từ tài khoản chủ sở hữu.
[Quản lý thông tin đăng nhập]
```

- Không avatar cá nhân lớn.
- Owner được sửa tên/đổi contact qua flow đúng.
- Manager/staff chỉ đọc.
- Không gọi owner là đại diện pháp luật.

## 5.5. Địa chỉ & pháp lý

Giữ tỉnh/thành, xã/phường, số nhà/đường, map, mã số thuế và giấy phép kinh doanh.

- Legal fields optional, có thể collapse.
- Map cao khoảng 260–320px desktop.
- Không ép KYC/thuế.
- Không thêm mô tả dài.

## 5.6. Tài khoản nhận tiền

```text
Tài khoản nhận tiền

Techcombank · •••• 8888                         Mặc định
CÔNG TY TNHH VIỆT CAR

                                      [Thêm tài khoản]
```

- Dùng canonical BankAccountList.
- Mask account number.
- Badge default nhỏ.
- Action set default/archive.
- Chỉ owner thao tác.
- Manager/staff không thấy action trái guard.
- Empty state compact, không illustration lớn.

## 5.7. Gói & hạn mức

Không còn title `Gói & hóa đơn`.

```text
Gói & hạn mức

Gian hàng theo chỗ xe               ● Đang hoạt động
Hết hạn 01/12/2026                           [Gia hạn / đổi gói]

[Ô tô: 8/8]    [Xe máy: 2/2]    [Còn 76 ngày]

⚠ Đã sử dụng hết chỗ ô tô. Xem lựa chọn nâng cấp.
```

- Một card chính full-width.
- Ba stat tile nhỏ, không dùng ba Card nặng.
- Dưới 80%: neutral/brand.
- 80–99%: warning.
- 100%: warning mạnh nhưng không progress đỏ toàn chiều rộng.
- Red chỉ khi error/vượt invariant.
- Không render PlanFeatureList thành upsell card lớn.
- Không hiện technical feature flags.
- Không hiện free trips nếu backend không ghi.
- Không hiện commission percent nếu phí thật lấy từ fee policy khác.

Permission:

- `SUBSCRIPTION_VIEW`: xem plan/quota.
- `SUBSCRIPTION_PURCHASE`: mua/gia hạn.
- Manager thiếu purchase không thấy CTA hoặc modal.
- Không render PurchaseModal trong DOM nếu thiếu quyền.

Tái sử dụng SubscriptionWorkspace, PurchaseModal, InvoicePaymentPanel và hooks. Refactor thành embedded variant; không clone business logic.

## 5.8. Hóa đơn thanh toán

Nằm dưới Gói & hạn mức.

Pending invoice:

```text
Cần thanh toán

Hóa đơn XPG123456
Còn thiếu 1.200.000đ
Hạn thanh toán 18/09/2026

[Hiện mã QR] [Sao chép nội dung]
```

- QR trong collapse/drawer/modal gọn.
- QR lỗi vẫn hiện account/amount/content.
- Partial invoice hiện số còn thiếu.

Không có invoice:

```text
Hóa đơn thanh toán

Chưa phát sinh hóa đơn.
Hóa đơn mua hoặc gia hạn gói sẽ xuất hiện tại đây.
```

Empty state cao khoảng 100–140px, không icon lớn. Lịch sử chỉ render table khi có data; có thể collapse bằng `Xem lịch sử thanh toán`. Mobile dùng list hoặc scroll hợp lý.

# 6. Header và dropdown Manage

Trong Manage chỉ có một hình nổi bật: logo shop, fallback initials của shop. Không hiển thị logo shop và avatar user cạnh nhau.

Dropdown:

```text
Việt Car Hà Nội
Đăng nhập: Phạm Đức Việt
Chủ gian hàng

Bảo mật tài khoản
Chuyến tôi đi thuê
Đăng xuất
```

`Chuyến tôi đi thuê` chỉ hiện khi phù hợp.

Không dùng logo shop làm `User.avatarUrl`. Cập nhật ManageUserCard/header/mobile tests và giữ logout behavior.

# 7. Trang Security

Tạo `/manage/security`, không nằm trong sidebar, max-width khoảng 900–1000px.

Không hiển thị shop logo uploader, avatar lớn, ShopEntryCard, gói, ví, hạn mức, hóa đơn hoặc bản sao shop profile.

Trang có ba section.

## 7.1. Phương thức đăng nhập

```text
Email       owner.hanoi@xeprime.test   ✓ Đã xác minh   [Đổi]
Điện thoại  0903 000 001               ✓ Đã xác minh   [Đổi]
```

Tái sử dụng ContactVerifyModal/profile hooks/API hiện có.

## 7.2. Đổi mật khẩu

Tái sử dụng ChangePasswordForm. Form một cột, requirements panel gọn bên phải desktop hoặc dưới mobile. Không kéo full-width.

## 7.3. Vùng nguy hiểm

Tái sử dụng AccountDeletionImpact và DeleteAccountView. Dùng một card danger nhẹ, tóm tắt impact ngắn; chi tiết dài collapse. Không thay đổi backend deletion.

`/manage/account` cũ chỉ redirect. Phân bổ chức năng:

- Shop/owner info → Shop.
- Contact/password/delete → Security.
- Renter trips → dropdown.
- ShopEntryCard → bỏ khỏi Manage.
- Personal avatar editor → bỏ khỏi Manage.

Không xóa AccountView nếu `/account` của khách thuê còn dùng.

# 8. Migration

Tạo migration drop:

```text
tenant_profiles.owner_full_name
tenant_profiles.owner_phone
tenant_profiles.owner_email
tenant_profiles.bank_name
tenant_profiles.bank_account_no
tenant_profiles.bank_account_name
tenant_profiles.qr_url

seller_profiles.bank_code
seller_profiles.bank_account_number
seller_profiles.bank_account_name
```

Chỉ drop sau khi search toàn repo xác nhận không còn runtime reference.

Không `prisma migrate reset` nếu không cần. Không truncate toàn DB. Chạy generator chính thức cho Prisma/OpenAPI/API client/types.

# 9. Permission

Owner có thể sửa shop, sửa tên chính mình, đổi email/SĐT qua verify, quản lý bank account, mua/gia hạn, mở Security và yêu cầu xóa account.

Manager có thể xem/sửa shop theo permission hiện có, xem owner contact, xem plan/quota và quản lý Security của chính manager. Manager không thể sửa owner User, quản lý shop bank account nếu API owner-only hoặc mua gói nếu thiếu purchase.

Staff/viewer không nhận thêm quyền do UI gộp; chỉ quản lý Security của chính họ và không thấy money data trái permission.

Backend guard là nguồn bảo vệ thật.

# 10. Mockup đích

```text
┌───────────────────────────────────────────────────────────────────────┐
│ [Logo] Việt Car Hà Nội  ● Đang hoạt động       [Xem shop] [Lưu]      │
│ Thông tin và thiết lập của gian hàng.                                │
└───────────────────────────────────────────────────────────────────────┘

┌──────────────────────┬────────────────────────────────────────────────┐
│ THIẾT LẬP            │ THÔNG TIN HIỂN THỊ                            │
│                      │ [Tên · Bio · Logo · Cover]                    │
│ ● Thông tin hiển thị │                                                │
│   Chủ gian hàng      │ CHỦ GIAN HÀNG                                 │
│   Địa chỉ & pháp lý  │ [Tên · Verified email · Verified phone]      │
│   Tài khoản nhận tiền│                                                │
│   Gói & hạn mức      │ ĐỊA CHỈ & PHÁP LÝ                             │
│                      │ [Địa chỉ · Map · Legal optional]              │
│                      │                                                │
│                      │ TÀI KHOẢN NHẬN TIỀN                          │
│                      │ [Canonical BankAccountList]                   │
│                      │                                                │
│                      │ GÓI & HẠN MỨC                                │
│                      │ [Plan · Quota · Expiry · CTA]                 │
│                      │ [Pending invoice / Compact invoice history]   │
└──────────────────────┴────────────────────────────────────────────────┘
```

Mobile stack dọc, có section selector ở đầu và không overflow.

# 11. Test và kiểm chứng

Bắt buộc test:

1. Sidebar không còn subscription/account/seller-profile.
2. Account-billing section biến mất nếu rỗng.
3. Ba route cũ redirect đúng.
4. Security route hoạt động.
5. Query section hoạt động và fallback đúng.
6. OwnerAccount lấy từ Tenant.owner.
7. Không còn owner contact legacy trong TenantProfile.
8. Shop verification dùng owner canonical.
9. Approval snapshot giữ owner contact.
10. Manager không sửa owner account.
11. Owner đổi contact làm Shop refresh.
12. Shop dùng BankAccountList scope shop.
13. Shop và WithdrawDialog dùng cùng cache.
14. Owner thao tác bank; manager không có action.
15. Owner thấy purchase CTA; manager không thấy CTA/modal.
16. Pending/partial invoice và QR vẫn hoạt động.
17. Empty invoice compact.
18. Manage header chỉ có một workspace image.
19. Dropdown có security/logout/renter trips phù hợp.
20. Security dùng contact verification, ChangePasswordForm và deletion flow hiện có.
21. SellerProfile/tax backend compile sau khi bỏ bank fields.
22. Wallet không lỗi.
23. `/manage/account/trips` vẫn hoạt động.
24. Permission owner/manager/staff đúng.
25. `git diff --check`.

Chạy unit tests, integration tests cần thiết, typecheck web/api/packages, lint, Prisma validate/generate, OpenAPI/API client generation và build phù hợp.

Kiểm tra viewport 1440px, 1024px, 768px và 390px cho:

```text
/manage/shop
/manage/shop?section=plan
/manage/security
```

Xác nhận không overflow, sticky nav không che header, logo/cover không méo, form không quá rộng, empty state gọn, QR đọc được, button không wrap xấu, keyboard focus/label/contrast đúng và không còn hai logo/avatar cạnh nhau.

# 12. Tiêu chí hoàn thành

Chỉ hoàn thành khi:

- Menu đã được dọn.
- Shop chứa đủ năm section.
- Plan/quota/invoice được nhúng đẹp vào Shop.
- Security riêng hoạt động.
- Route cũ redirect đúng.
- Owner contact chỉ còn một nguồn User.
- Bank account chỉ còn một nguồn `bank_accounts`.
- Legacy columns đã drop.
- SellerProfile không còn UI owner nhưng backend cần thiết vẫn compile.
- Permission đúng.
- Không regression wallet/subscription/payment.
- Test/typecheck/build thực tế pass.

# 13. Báo cáo cuối

Báo cáo ngắn gọn:

1. Menu trước/sau.
2. Route redirect.
3. Nguồn canonical của shop, owner, bank account, subscription và security.
4. Cột legacy đã drop.
5. SellerProfile đã xử lý thế nào.
6. Logo/avatar đã xử lý thế nào.
7. Component chính đã refactor/tạo.
8. Permission owner/manager/staff.
9. Test/typecheck/build đã chạy và kết quả thực tế.
10. File chính đã đổi.
11. Rủi ro/TODO còn lại.

Không kết thúc khi mới sửa code; phải chạy kiểm chứng và báo kết quả thực tế.
