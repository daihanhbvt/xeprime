# ADR 0049 — Màn "Duyệt xe": duyệt trên ảnh chụp lúc gửi, danh mục kiểm tra là cổng backend; tạm ngừng xác minh gian hàng

Ngày: 24/09/2026 · Trạng thái: Accepted · Mở rộng: 0008 (vòng duyệt xe), 0036 điều 1 & 6 · Tạm dừng (không xoá): **0036 điều 3** (trục xác minh gian hàng) · Liên quan: 0012, 0014, 0028, 0038, 0040

## Bối cảnh

Màn `/manage/admin` ("Duyệt hồ sơ") là một hàng đợi chung cho mọi loại phiếu `approval_tasks`, và nó
để người duyệt ra quyết định trên thứ họ không nhìn thấy đủ:

1. **Hồ sơ xe chỉ là các cột phẳng của `vehicles`.** Thứ khách thấy ngoài chợ còn đến từ chính sách
   thuê hiệu lực (giao xe, giới hạn km, cọc), thiết lập theo dịch vụ (tự nhận chuyến, điều khoản
   riêng) và tiện nghi — ba nguồn mà snapshot cũ không chụp. Đọc bản SỐNG lúc duyệt cũng không đúng:
   chủ xe sửa được chúng bất cứ lúc nào sau khi bấm gửi.
2. **"Kiểm tra" chỉ nằm trong đầu người duyệt.** Không có dấu vết ai đã đối chiếu ảnh, biển số, trùng
   lặp; nút Duyệt bấm được ngay khi mở phiếu.
3. **Hai người duyệt bấm cùng lúc đều thành công.** `review()` đọc `status` NGOÀI transaction rồi mới
   ghi — hai dòng log, hai thông báo mâu thuẫn cho chủ xe.
4. **Không lọc/đếm được theo loại xe hay nguồn đăng** — hàng đợi chỉ lọc được trạng thái và loại phiếu.
5. Phiếu XÁC MINH GIAN HÀNG (ADR 0036 điều 3) nằm chung hàng đợi. Nền tảng quyết định (24/09/2026)
   gian hàng hiện KHÔNG cần xác minh; tuyến gói đã không cần nó để mua gói từ ADR 0040.

## Quyết định

1. **Màn "Duyệt xe" chỉ xử lý phiếu XE**, qua route riêng `/platform/vehicle-approvals`. Loại phiếu
   là điều kiện của endpoint (id phiếu khác loại ⇒ 404), không phải một tham số client quên gửi được.
   Route chung `/platform/approvals` giữ nguyên cho tương thích; cả hai đi qua MỘT đường quyết định
   `PlatformApprovalService.decide`.

2. **Hồ sơ được duyệt là ẢNH CHỤP v2 lúc gửi** (`VehicleReviewSnapshot`, @xeprime/types): xe (đủ
   thông số theo loại/nguồn năng lượng), toàn bộ ảnh, tiện nghi, giá, thiết lập theo dịch vụ, chính
   sách thuê hiệu lực (precedence của `PricingService.effectivePolicy`), điểm nhận xe với địa chỉ đầy
   đủ, nguồn đăng. Dựng trong CÙNG transaction với phiếu, bởi một hàm duy nhất
   (`buildVehicleReviewSnapshot`). Phiếu cũ (v1/không snapshot) được dựng bằng chính hàm đó trên dữ
   liệu sống và DTO nói rõ `basis = live` — không vá nửa vời v1 thành một hồ sơ trông như đã gửi.

3. **Nguồn đăng (Gian hàng/Cá nhân) đóng băng lúc gửi**, suy bằng `resolveStorefrontKind` từ tuyến
   thu phí hiệu lực — KHÔNG từ `tenant_type` (ADR 0014 điều 2). Nó cùng tên/mã/biển số/loại xe/ảnh đại
   diện đi vào bảng hình chiếu `approval_vehicle_subjects` (1-1 với phiếu, writer duy nhất
   `VehiclesService.createVehicleApprovalTask`) để hàng đợi lọc, tìm (trigram) và đếm theo tab ở DB,
   TRƯỚC phân trang, trong cùng lần đọc với danh sách.

4. **Danh mục kiểm tra có hai nhóm khác bản chất.**
   - _Tự động_: chính cổng gửi duyệt (`applicablePublishRequirements`/`missingPublishRequirements`)
     chấm trên snapshot — `vehicleReviewAutoChecks`, không bộ luật thứ hai.
   - _Thủ công_: năm mục `VEHICLE_REVIEW_CHECK`, lưu ở `approval_review_checks` (một dòng mỗi phiếu ×
     mục, người + thời điểm, audit mỗi lần đổi). **Phê duyệt bị BACKEND chặn** khi còn mục chưa đạt
     (`APPROVAL_CHECKLIST_INCOMPLETE`); web khoá nút bằng cùng hàm `missingVehicleReviewChecks`.
     Từ chối / yêu cầu bổ sung KHÔNG qua cổng này và BẮT BUỘC lý do gửi chủ xe.
   - KHÔNG có mục giấy tờ (đăng ký, đăng kiểm, bảo hiểm TNDS): luồng đăng xe không thu chúng. Thêm mục
     giấy tờ cùng lúc với việc thu giấy tờ thật, không trước.

5. **Mọi thao tác ghi lên một phiếu khoá dòng phiếu** (`SELECT … FOR UPDATE`) trước khi đọc trạng
   thái: quyết định, đánh dấu kiểm tra, ghi chú. Người thứ hai nhận `APPROVAL_ALREADY_DECIDED`; một
   lượt bỏ đánh dấu không chen được vào giữa "đọc thấy đủ" và "chốt phiếu".

6. **Ghi chú nội bộ** (`approval_tasks.internal_note*`) tách khỏi `reason` (lý do gửi chủ xe), trần
   2000 ký tự bằng CHECK, khoá lạc quan theo `internal_note_updated_at` (`APPROVAL_NOTE_CONFLICT` kèm
   bản đang lưu), audit mỗi lần sửa.

7. **Phê duyệt đưa XE SỐNG lên chợ, nên xe sống phải còn khớp hồ sơ đã được xem.** Dưới khoá dòng,
   backend dựng lại ảnh chụp từ dữ liệu sống và so với ảnh chụp lúc gửi (`vehicleApprovalBlockers`):
   xe vẫn qua cổng lên chợ, và năm trường căn cước (`VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS`) không đổi.
   Lệch ⇒ 409 `APPROVAL_SUBJECT_CHANGED` kèm `{ changedLockedFields, missingRequirements }` — MỘT mã
   cho cả hai vì lối đi tiếp là một: yêu cầu bổ sung để chủ xe gửi lại. Chi tiết phiếu chờ trả sẵn
   `approvalBlockers` để web tắt nút Phê duyệt và nói vì sao. Giá, chính sách, tiện nghi không bị so:
   chúng sửa được sau khi lên chợ như mọi xe đã duyệt.

   Phép so chỉ đúng khi không ai sửa xe giữa "đọc" và "chốt": lượt duyệt khoá cả dòng XE
   (`lockVehicleRow`) trước khi đọc xe sống, và `VehiclesService.applyUpdate` (gồm cả thay ảnh) khoá
   cùng dòng đó trước khi đọc bản hiện tại. Bên thua đọc bản đã commit của bên thắng. Thứ tự khoá
   toàn hệ thống: PHIẾU trước, XE sau — lượt xoá xe huỷ phiếu chờ TRƯỚC khi xoá mềm xe vì cùng lý do.

8. **Chủ xe xoá xe khi phiếu còn chờ ⇒ phiếu HUỶ** (`cancelled`, dòng log `cancel`, audit
   `vehicle.cancel_public_review`) trong cùng transaction xoá mềm. Hàng đợi, số đếm và dashboard bỏ
   qua xe đã xoá — không để người duyệt mở một phiếu mà quyết định nào cũng vô nghĩa.

9. **Tạm ngừng xác minh gian hàng.** Web bỏ nút gửi / gửi lại xác minh, mọi dải trạng thái xác
   minh, và checklist "Hoàn thiện hồ sơ" thôi nhắc "gửi duyệt" (hiện theo quyền sửa, không theo trạng
   thái xác minh); backend bỏ khoá sửa hồ sơ khi còn phiếu xác minh chờ (`TenantsService.updateProfile`), vì
   không còn ai xử lý phiếu đó và cái khoá sẽ thành vĩnh viễn. Dữ liệu trục xác minh (`SHOP_VERIFICATION`,
   phiếu `tenant` cũ) GIỮ NGUYÊN — gian hàng đã xác minh vẫn là đã xác minh. Dashboard nền tảng chỉ
   còn lối tắt "Xe chờ duyệt".

## Hệ quả

- Migration `20260924090000_vehicle_approval_review`: bảng `approval_vehicle_subjects`,
  `approval_review_checks`, ba cột ghi chú nội bộ, index `(target_type, status, submitted_at)`; backfill
  hình chiếu cho phiếu xe cũ (nguồn đăng suy từ tuyến HIỆN TẠI theo bốn pha của
  `resolveEffectiveBilling`, vì phiếu cũ không chụp tuyến).
- Spec nào phê duyệt phiếu xe phải đánh dấu đủ danh mục trước (`test/helpers/vehicle-review-fixture.ts`).
- `DetailDrawer` có cỡ `xl` (token `drawer-width-xl`: ~75% màn lớn, trần 1400px; tablet/mobile toàn
  màn hình).

## Hoãn có chủ đích

- **App mobile vẫn còn nút gửi xác minh gian hàng** (`apps/mobile/src/api/tenants`, `ShopStatusBanner`
  native) — thuộc phạm vi đội mobile. Endpoint `POST /tenants/current/submit-review` giữ nguyên để
  không vỡ app đang phát hành; phiếu sinh ra từ đó không còn khoá gì và không hiện ở màn "Duyệt xe".
- Nhãn hai hành động audit mới (`approval.check_update`, `approval.internal_note_update`) ở màn nhật ký
  admin: khu đó chưa i18n hoá; nó hiện mã hành động khi thiếu nhãn.

## Điều kiện xem lại

- Nền tảng mở lại xác minh gian hàng ⇒ cần một nơi duyệt riêng cho phiếu `tenant` (KHÔNG trộn lại vào
  màn "Duyệt xe") và khôi phục có chủ đích (hoặc không) cái khoá sửa hồ sơ khi đang chờ.
- Luồng đăng xe thu giấy tờ xe ⇒ thêm mục kiểm tra giấy tờ vào `VEHICLE_REVIEW_CHECK` và snapshot.
