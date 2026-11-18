# ADR 0103 - Logo gian hàng bắt buộc ngay lúc tạo gian hàng tuyến gói

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 - người dùng chốt sau khi đăng xe trên staging bị báo
"Hồ sơ gian hàng còn thiếu thông tin: Logo gian hàng") · Ghi đè: [0040](0040-registration-track-split.md)
điều 7 trong phạm vi "logo không bị hỏi lúc đăng ký / nâng cấp, chỉ bị đòi lúc gửi xe duyệt" · Liên quan:
[0036](0036-single-approval-gate-for-commission-owners.md) (chủ xe tuyến hoa hồng không cần logo)

## Bối cảnh

ADR 0040 điều 7 đòi logo ở cổng GỬI XE DUYỆT của gian hàng tuyến gói (`missingPackageShopListingRequirements`),
còn bước đăng ký và luồng nâng cấp cố ý không hỏi logo: "đòi một tấm ảnh trước khi người ta kịp trả tiền là
ma sát đặt sai chỗ". Thực tế chủ gian hàng đi hết đăng ký, trả tiền gói, điền xong cả wizard thêm xe, rồi mới
nhận lỗi thiếu logo đúng lúc bấm "Gửi duyệt". Người dùng chốt: logo bắt buộc ngay lúc tạo gian hàng.

## Quyết định

1. **Form đăng ký một trang, tuyến gói** (`/register?track=package`, `PartnerSignupForm`): có ô "Logo gian
   hàng" bắt buộc (`ShopLogoPicker`). Ảnh được chọn và xem trước ở máy. Đường ký URL ảnh gian hàng
   (`POST /uploads/shop-media/presign`) cần một gian hàng, nên thứ tự là: tạo tài khoản → `POST /tenants` →
   tải logo lên → `PATCH /tenants/current/profile { logoUrl }`. Nếu bước logo hỏng, form báo rõ gian hàng
   đã được tạo; bấm lại thì bỏ qua `POST /tenants` và chỉ tải lại logo.
2. **Lưới an toàn ở onboarding** (`/onboarding`, `package_pending`): gian hàng chưa có logo đứng lại ở bước 1
   "Thông tin gian hàng" (`ShopLogoRequiredStep`) và chưa vào được bước chọn gói. Trường hợp này gồm gian
   hàng đăng ký từ app (chưa có ô logo), gian hàng đăng ký trước ADR này, và lượt tải logo hỏng rồi rời
   trang. Mã chuyển khoản đang chờ, nếu có, vẫn hiện bên dưới: khoản tiền đã chuyển không bị giấu. Đọc hồ
   sơ lỗi thì KHÔNG chặn.
3. **Luồng nâng cấp từ tuyến hoa hồng** (bước "Thông tin gian hàng" của `PackageUpgradeWizard`): logo bắt buộc
   (`shopUpgradeSchema.logoUrl`, mã `logoRequired`). Schema này chỉ web dùng.
4. **Tuyến hoa hồng không đổi**: không có ô logo, không bị đòi logo (ADR 0040 điều 7 · ADR 0036).
5. **Server không đổi**: `POST /tenants` không nhận và không đòi logo, vì app Partner đang phát hành vẫn gửi
   form cũ. Cổng gửi xe duyệt vẫn soát logo như trước. Đó là lớp chặn cuối cho mọi đường vào.

## Hệ quả

- Gian hàng tuyến gói tạo trên web luôn có logo trước khi trả tiền gói, nên lỗi thiếu logo lúc gửi xe duyệt
  chỉ còn xảy ra khi chủ gian hàng tự gỡ logo ở trang Cửa hàng.
- `partnerSignupSchema` (dùng chung với app) KHÔNG có trường logo. Ô logo là state riêng của form web, tự báo
  lỗi cùng lúc với lỗi của các ô khác.
- **App Partner chưa theo**: đăng ký gian hàng trên app vẫn chưa hỏi logo. Người đó bị lưới an toàn ở điều 2
  đòi logo khi mở website để chọn gói. App cần thêm ô logo ở đợt mobile kế tiếp (ADR 0031: hai bản không tự
  đồng bộ).
- Test: `onboarding-page.test.tsx` (bước logo chặn chọn gói; mã chờ vẫn hiện), `partner-signup-form` (thiếu
  logo không gửi gì; đủ logo thì tải lên rồi `PATCH` hồ sơ).

## Cần xem lại khi

App Partner có ô logo lúc đăng ký. Khi đó cân nhắc chuyển sang server bắt buộc: một đường ký URL ảnh theo
TÀI KHOẢN trước khi có gian hàng, và `POST /tenants` tuyến gói đòi `logoUrl`.
