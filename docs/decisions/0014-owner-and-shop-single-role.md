# ADR 0014 — Chủ xe và chủ gian hàng là MỘT vai; năng lực đến từ GÓI, không từ role

Ngày: 21/08/2026 · Trạng thái: **Partially superseded bởi [ADR 0020](0020-two-revenue-tracks-one-marketplace.md) và [ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md)**. Nguyên tắc một role/capability từ gói vẫn còn hiệu lực; phạm vi XePrime đứng giữa giao dịch đã đổi.

> ⚠️ **Hai điều khoản đã được sửa (28/08/2026):**
>
> - **Điều 3** — [ADR 0024](0024-billing-mode-from-plan-frozen-on-booking.md) mở rộng: `plans`
>   quyết định **năng lực VÀ chế độ thu phí**.
> - **Điều 5** — [ADR 0020](0020-two-revenue-tracks-one-marketplace.md) thêm **đúng một dòng**
>   vào cột *"VẪN đứng giữa"*: **phí dịch vụ của chính nền tảng**. Mọi dòng khác ở nguyên chỗ —
>   đặc biệt *"Giá, điều kiện thuê, cọc"* vẫn thuộc cột *"KHÔNG đứng giữa"*.
>
> **Điều 1** (mọi xe thuộc một tenant) và **điều 2** (`tenant_type` chỉ là nhãn hiển thị, không
> bao giờ dùng cho quyền/hạn mức/tiền) **giữ nguyên hiệu lực tuyệt đối**.

## Bối cảnh

Sản phẩm phục vụ hai nhóm người cho thuê: cá nhân có 1–3 xe tự khai thác, và gian hàng có đội xe
cùng nhân sự. Câu hỏi đặt ra là có tách chúng thành hai role/hai thực thể sở hữu xe hay không, và
"nâng cấp lên gian hàng" nghĩa là gì về mặt dữ liệu.

Trước ADR này, `tenants.tenant_type` (`individual | business`) đã tồn tại từ Phase 0 — có cột, có
index, có ô chọn trong form đăng ký — nhưng **không điều khiển bất cứ hành vi nào**; nó chỉ được
hiển thị lại ở màn quản trị. Còn `plans`/`tenant_subscriptions` (ADR 0010) mới là nơi có hạn mức
thật, và chưa được dùng để phân biệt hai nhóm.

## Quyết định

1. **MỘT role `shop_owner`, MỘT thực thể sở hữu xe là `tenants`.** Cá nhân cho thuê xe cũng là một
   tenant. Không có role "chủ xe" riêng, không có đường sở hữu xe nào không đi qua `tenant_id`.

2. **`tenants.tenant_type` chỉ quyết định CHỮ HIỂN THỊ** — cách xưng hô ngoài Marketplace, badge ở
   `/shops/[slug]`, cách gọi trong hợp đồng. **Nó không bao giờ được dùng để quyết định quyền hay
   hạn mức.** Guard đọc quyền từ DB (ADR 0002); hạn mức đọc từ gói (điều 3).

3. **`plans` quyết định NĂNG LỰC**: số xe theo loại, số nhân sự, số chi nhánh, tính năng nào mở.
   Ẩn/hiện menu và chặn thao tác đọc từ gói hiện hành, **không** đọc từ `tenant_type`.

4. **"Nâng cấp lên gian hàng" = mua gói khác + đổi nhãn `tenant_type`.** Không chuyển sở hữu, không
   đổi ID, không tạo tenant mới, không duyệt lại xe, không đụng session.

5. **XePrime là cái CHỢ: nền tảng không đứng giữa quan hệ khách ↔ gian hàng.** Ranh giới:

   | Nền tảng VẪN kiểm duyệt | Nền tảng KHÔNG đứng giữa |
   | --- | --- |
   | Gian hàng được mở hay không (`approval_tasks`) | Giấy tờ tuỳ thân của khách thuê |
   | Xe được lên chợ hay không (`approved_public`) | Giá, điều kiện thuê, cọc |
   | Xe vi phạm bị ẩn (`platform.vehicles.moderate`) | Tranh chấp giữa khách và gian hàng |
   | Gói/hạn mức của gian hàng | Việc giao nhận xe |

   Hệ quả trực tiếp: **xác thực giấy tờ khách là việc của gian hàng, làm tay lúc giao xe.** Nền
   tảng có thể xác minh ở mức toàn sàn theo ca, nhưng **không có hàng đợi duyệt giấy tờ mặc định**
   và thiếu giấy tờ **không chặn** khách đặt xe.

## Vì sao không tách role

`tenant_id` là xương sống của toàn bộ schema (52 model). Một thực thể "chủ xe" sở hữu xe mà không
phải tenant sẽ buộc phải nhân đôi đường đi cho `public_listings` (ADR 0008), `vehicle_occupancies`
(ADR 0006), `tenant_customers` (composite FK), `receipts`/`payments`/`contracts`, `approval_tasks`,
`/shops/[slug]` và `TenantScopeGuard`.

Và chiều ngược lại quan trọng không kém: người có 1 xe **vẫn cần** lịch xe, đơn thuê, bàn giao, thu
tiền, hợp đồng. Làm sản phẩm nhẹ cho họ là **giấu bớt giao diện theo gói**, không phải bỏ tenant.

Quyết định 4 là lợi ích lớn nhất: nếu tách role, "nâng cấp" trở thành thao tác chuyển toàn bộ xe /
đơn / lịch / sổ tiền sang một thực thể khác — thứ không ai dám bấm trên production.

## Hoãn có chủ đích

- **`individual → business` có cần duyệt lại không.** Theo điều 5 thì nghiêng về cho tự đổi, nhưng
  `tenant_type` xuất hiện trên hợp đồng gửi khách nên còn là câu hỏi pháp lý — chưa chốt.
- **Chủ xe KÝ GỬI có tài khoản đăng nhập.** Hiện `vehicle_source_details.sourceType = partnership`
  mô hình hoá họ như **đối tác không có tài khoản** (tên/SĐT/`commissionPercent`). Nếu sau này họ
  cần tự đăng nhập xem doanh thu xe mình, đó là một vai MỚI (`vehicle_partner`) với scope là DANH
  SÁCH XE chứ không phải tenant — **khác hẳn** câu hỏi mà ADR này trả lời.

## Hệ quả

- `tenant_type` phải được rà lại: mọi chỗ đang (hoặc sắp) dùng nó để quyết định logic là sai theo
  điều 2, chuyển sang đọc gói.
- Ẩn/hiện tính năng phải có một nguồn duy nhất là gói hiện hành → xem ADR 0015 cho hình dạng
  `plans.limits_json`.
- Marketplace phải hiển thị đúng danh xưng theo `tenant_type` mà không rò rỉ nó thành sự khác biệt
  về quyền.
