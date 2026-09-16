# ADR 0036 — Tuyến hoa hồng có MỘT cổng duyệt: duyệt XE. Xác minh gian hàng là trục riêng

Ngày: 14/09/2026 · Trạng thái: **Accepted; điều 4 bị [ADR 0040](0040-registration-track-split.md) ghi đè** · **Ghi đè [ADR 0014](0014-owner-and-shop-single-role.md) điều 5** (dòng *"Gian hàng được mở hay không (`approval_tasks`)"*) trong phạm vi tuyến hoa hồng

## Bối cảnh

Luồng "cá nhân đăng xe cho thuê" bế tắc hoàn toàn trên `develop`, và nó bế tắc theo kiểu khó
thấy nhất: **mỗi mảnh đều đúng khi đứng một mình.**

1. `TenantsService.registerShop` tạo tenant ở `draft` — hợp lý, hồ sơ mới thì chưa ai xem.
2. `VehiclesService.submitForPublicReview` từ chối khi tenant chưa `active` — cũng hợp lý, xe
   của một gian hàng chưa được mở thì không nên lên chợ.
3. `TENANT_STATUS_PUBLISHABLE = ['active']` ([ADR 0008](0008-public-listings-sync.md)) — đúng nốt.

Ghép ba mảnh lại thì một người có **một chiếc xe** phải đi qua **hai vòng duyệt** để bán được
chuyến đầu tiên. Và trong bản đã commit, wizard đăng xe công khai gọi thẳng `submit-public` mà
không nơi nào gọi `submit-review`, nên kết cục thực tế là:

> phiếu duyệt gian hàng rời hàng đợi `pending`, chiếc xe vẫn `draft`, `public_listings` rỗng, và
> chủ xe không có nút nào để bấm. Lối thoát duy nhất là tự mò vào `/manage/shop` — đúng khu mà
> [ADR 0027](0027-feature-tiers-basic-owner-vs-shop.md)/[ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md)
> nói tuyến hoa hồng không thuộc về.

Một hướng vá đã được thử: *duyệt gian hàng xong thì tự đẩy xe đủ điều kiện vào hàng đợi duyệt
xe* (`autoSubmitEligibleVehicles`). Nó gỡ được bế tắc nhưng **giữ nguyên nguyên nhân** — vẫn hai
vòng duyệt, và chủ xe phải chờ hết vòng thứ nhất mới biết chiếc xe của mình có vấn đề gì. Với
một người đang cân nhắc giao chiếc xe của mình cho một nền tảng lạ, đó là vài ngày im lặng ở
đúng chỗ dễ bỏ cuộc nhất.

Câu hỏi thật là: **cổng duyệt gian hàng hỏi thêm được gì mà cổng duyệt xe không hỏi?** Với một
cá nhân cho thuê một chiếc xe: *không gì cả.* Họ tên, số điện thoại đã xác thực, địa chỉ nhận
xe, ảnh xe, giấy tờ xe, giá — tất cả đều nằm trong chính phiếu duyệt xe.

## Quyết định

1. **Tuyến hoa hồng có ĐÚNG MỘT cổng kiểm duyệt: `approval_tasks` loại `VEHICLE`.**
   Mở hồ sơ chủ xe không sinh phiếu duyệt gian hàng và không chờ ai.

2. **`tenants.status` chỉ còn là trạng thái VẬN HÀNH.** `registerShop` tạo tenant ở `active`.
   Cột này trả lời đúng một câu — *gian hàng còn được hoạt động không* — và nó đổi bằng
   khoá/mở khoá của `PlatformTenantsService`, không bằng một vòng duyệt hồ sơ.

   `active` ở đây **không** có nghĩa "đã xác minh", và **không** tự công khai gì: xe vẫn sinh ra
   ở `draft` và vẫn phải qua phiếu duyệt XE mới lên chợ (ADR 0008 nguyên vẹn).

3. **XÁC MINH GIAN HÀNG là trục THỨ HAI, độc lập** (`SHOP_VERIFICATION` ở `@xeprime/types`), đọc
   từ phiếu `approval_tasks` loại `tenant` MỚI NHẤT:

   | Phiếu mới nhất | `verification` |
   | --- | --- |
   | không có / `cancelled` / giá trị lạ | `unverified` |
   | `pending` | `pending` |
   | `approved` | `verified` |
   | `needs_revision` / `rejected` | tương ứng |

   Không thêm cột: phiếu duyệt đã là nguồn sự thật của quyết định đó (ai duyệt, lúc nào, lý do
   gì — CLAUDE.md mục 6 lằn ranh 2), và một cột song song chỉ là bản sao sẽ lệch vào ngày ai đó
   ghi một chỗ mà quên chỗ kia.

4. ~~**Xác minh là cổng của việc MUA GÓI thuê bao, không phải cổng đăng xe.**~~
   **⚠️ BỊ [ADR 0040](0040-registration-track-split.md) điều 5 GHI ĐÈ (16/09/2026).**

   Điều khoản gốc: `BillingService.purchase` từ chối gói `billingMode = package` khi
   `verification !== verified` (`SHOP_VERIFICATION_REQUIRED`).

   Vì sao bỏ: ghép nó với luồng đăng ký gian hàng trả phí thì thứ tự thành *tạo gian hàng → gửi
   hồ sơ xác minh → CHỜ admin (không SLA) → mới được trả tiền*, và trong lúc chờ họ không dùng
   được gì cả. Nay **thanh toán mở tuyến gói và Manage**; nó không mở bất cứ thứ gì thuộc trục
   kiểm duyệt — xe vẫn đi qua phiếu duyệt XE từng chiếc, và không nơi nào đánh
   `verification = verified` vì tiền đã về.

   Điều 1–3 và 5–6 của ADR này KHÔNG đổi: trục xác minh vẫn tồn tại, vẫn đọc từ phiếu duyệt, và
   vẫn không được đụng tới xe đang bán.

5. **Xin xác minh KHÔNG được đụng tới xe đang bán.** `submitForReview` không còn hạ
   `tenants.status` xuống `pending_review`. Bản cũ làm vậy, và vì `TENANT_STATUS_PUBLISHABLE`
   chỉ nhận `active`, một gian hàng đang bán tốt mà xin xác minh để **trả tiền** sẽ thấy toàn bộ
   xe của mình biến khỏi marketplace trong lúc chờ. Tương tự, từ chối/yêu cầu bổ sung hồ sơ pháp
   nhân không gỡ gian hàng khỏi trạng thái hoạt động.

6. **Một phiếu CHỜ cho mỗi đối tượng, và đó là một ràng buộc DB.**
   Unique index một phần `approval_tasks_pending_target_uq` (`(target_type, target_id) WHERE
   status = 'pending'`). Bấm gửi duyệt hai lần, mở hai tab, hay thử lại sau khi mạng chập đều
   cho ra **một** phiếu; lần gọi thừa trả về trạng thái hiện tại chứ không phải một lỗi đỏ.
   Kiểm ở tầng app chỉ thu hẹp cửa sổ, không đóng được nó.

7. **Điều kiện lên chợ có MỘT bản luật, dưới dạng MÃ.**
   `missingPublishRequirements` ở `@xeprime/types` chạy ở cả backend (cổng thật) lẫn web
   (checklist). Trước đó có hai bản — một trả câu tiếng Việt, một trả khoá — và cả hai docblock
   đều tự ghi *"sửa một bên phải sửa cả hai"*. `details.missing[]` mang mã `PUBLISH_REQUIREMENT`,
   nên giao diện tiếng Anh chỉ đúng từng mục còn thiếu ([ADR 0012](0012-i18n-shared-url-cookie-locale.md)).

8. **Người duyệt trả xe về thì phải BÁO.** `request_revision` có loại thông báo riêng
   (`VEHICLE_NEEDS_REVISION`, `SHOP_NEEDS_REVISION`); trước đó nhánh này không gửi gì cả, nên
   chiếc xe nằm im ở `needs_revision` vô thời hạn trừ khi chủ xe tự mở lại đúng màn đó.

## Vì sao không giữ hai cổng

**"Duyệt gian hàng" với một cá nhân là một cái tên không có nội dung.** Reviewer nhìn vào phiếu
đó thấy: tên người, số điện thoại, tỉnh. Ba thứ ấy đều đi kèm phiếu duyệt XE, cùng với ảnh xe và
giấy tờ xe — tức là phiếu duyệt xe là một hồ sơ **giàu hơn** để ra cùng một quyết định. Cổng thứ
nhất không lọc thêm được ai; nó chỉ làm chậm.

**Và nó chậm đúng ở chỗ đắt nhất.** Chủ xe cá nhân chưa có gì ràng buộc với nền tảng. Khoảng
giữa "điền xong form" và "xe lên chợ" là toàn bộ phễu, và mỗi vòng duyệt thêm vào đó là một lần
họ phải quay lại mà không nhận được gì.

**Rủi ro không biến mất, nó chuyển chỗ.** Ai không được bán vẫn chặn được — bằng từ chối phiếu
duyệt XE (không lên chợ), hoặc bằng khoá gian hàng (`suspended`, gỡ toàn bộ xe ngay lập tức).
Cái mất đi chỉ là một phiếu không ai đọc kỹ.

**Tuyến thuê bao giữ nguyên cổng của nó**, vì ở đó câu hỏi khác hẳn: gian hàng nhiều xe, nhiều
nhân sự, sổ thu chi và công nợ — và họ trả tiền cho bộ đó. Xem xét pháp nhân trước khi mở nó là
đúng việc, và điều 4 đặt cổng vào đúng thời điểm thay vì đặt nó chắn ngang lối vào.

## Hệ quả

- `tenants.status` **không còn** là máy trạng thái duyệt hồ sơ. Mọi chỗ đọc `pending_review` để
  suy ra "đang chờ duyệt" phải chuyển sang `verification` — đã sửa ở `TenantsService`,
  `ShopProfileWorkspace`, `ShopStatusBanner`, `ShopOnboardingCard`, `OwnerRegistrationView`.
- `autoSubmitEligibleVehicles` bị **xoá**. Duyệt xác minh gian hàng không còn hiệu ứng phụ nào
  lên xe — một hiệu ứng như vậy bây giờ chỉ là cách âm thầm đưa xe vào hàng đợi sau lưng chủ xe.
- `draft` / `pending_review` / `needs_revision` của `tenants.status` chỉ còn ở **dữ liệu cũ**.
  Migration `20260914180000_single_gate_vehicle_approval` mở chúng sang `active`; `rejected`,
  `suspended` và `expired` để nguyên vì cả ba là quyết định của một con người hoặc của job gói.
  Phiếu duyệt gian hàng cũ đang `pending` giữ nguyên — chúng vẫn là yêu cầu xác minh hợp lệ dưới
  mô hình mới, và duyệt một phiếu như vậy bây giờ chỉ có nghĩa "đã xác minh".
- Reviewer nhận **đủ bằng chứng**: snapshot phiếu duyệt xe mang cả thư viện ảnh và chi nhánh/tỉnh
  (trước đó chỉ có `mainImageUrl` — duyệt một chiếc xe lên chợ khi chỉ nhìn được một tấm ảnh).
- `latestPublicReview` chuyển lên `VehicleListItemDto`: lý do bị trả về đọc được ngay trong danh
  sách xe của chủ xe, không phải mở từng chiếc để đi tìm.

## Hoãn có chủ đích

- **Nhãn "gian hàng đã xác minh" trên marketplace.** Trục dữ liệu đã có; hiển thị nó ra chợ là
  một lời hứa với khách thuê và cần định nghĩa xem xác minh đó bảo đảm ĐIỀU GÌ. Chưa chốt.
- **Xác minh người bán phục vụ thanh toán** (`seller_profiles`) vẫn là quy trình **riêng**, và ADR
  này không đụng tới nó. Nó gác gate TIỀN THẬT (R4), không gác cổng đăng xe — trộn hai thứ là
  đuổi người bán đi trước khi họ kịp thấy lý do phải khai.

## Điều kiện xem lại

- Tỉ lệ xe bị từ chối vì lý do lẽ ra cổng duyệt gian hàng đã bắt được (giả mạo danh tính, một
  người mở nhiều hồ sơ). Nếu nó xuất hiện thật, câu trả lời là **siết cổng duyệt XE** hoặc thêm
  kiểm danh tính ở tầng tài khoản — không phải dựng lại cổng thứ hai.
- Khi mở thu hộ đầy đủ (R4), rà lại điều 4: lúc đó có thể có thao tác khác cũng cần `verified`.
