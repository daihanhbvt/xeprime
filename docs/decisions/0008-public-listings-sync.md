# ADR 0008 — Quy tắc đồng bộ `public_listings`

Ngày: 22/07/2026 · Trạng thái: Accepted · Áp dụng ở Phase 3

## Bối cảnh

`public_listings` là bảng snapshot: nó nhân bản ~20 cột từ `vehicles`, `vehicle_pricing`, `branches`, `tenants` để marketplace query nhanh trên một bảng phẳng.

`database_design.md` mô tả cấu trúc nhưng để ngỏ phần vận hành: *"Khi xe đổi thông tin, nếu đã approved thì **có thể** yêu cầu duyệt lại phần public."* — "có thể" là chỗ sinh bug.

Câu chưa ai trả lời: ai ghi bảng này, ghi lúc nào, và khi khoá tenant thì chuyện gì xảy ra với listing của tenant đó? Bảng snapshot không có quy tắc rõ luôn dẫn tới cùng một loại lỗi: **listing ma** — xe đã xoá/đã ẩn/shop đã bị khoá nhưng vẫn hiện ngoài marketplace và khách vẫn đặt được.

## Quyết định

### 1. Chỉ một service được ghi

`ListingsService.syncFromVehicle(vehicleId, tx)`. Không module nào khác `INSERT`/`UPDATE` vào `public_listings`. Luôn nhận transaction client để ghi cùng transaction với thay đổi nghiệp vụ gây ra nó.

### 2. Bốn sự kiện kích hoạt sync

| Sự kiện | Hành động |
| --- | --- |
| Admin duyệt xe public | Tạo/cập nhật listing, `status = active` |
| Sửa **trường không nhạy cảm** của xe đã approved (mô tả, ảnh phụ, tiện ích) | Cập nhật listing tại chỗ, giữ `active` |
| Sửa **trường nhạy cảm** (giá, biển số, loại xe, chi nhánh, ảnh đại diện) | Listing về `hidden` + `vehicle.public_status = pending_public_review` + tạo `approval_task` mới |
| Xoá mềm xe | Listing `archived` |

Danh sách "trường nhạy cảm" khai báo thành hằng số trong code, không quyết định ad-hoc từng chỗ.

### 3. Trạng thái tenant **không** denormalize vào listing

Cám dỗ: thêm cột `tenant_status` vào `public_listings` để query một bảng. Từ chối, vì khoá một tenant có 500 xe sẽ thành một lần `UPDATE` 500 dòng — chậm, và nếu đứt giữa chừng thì còn listing ma.

Thay vào đó marketplace **luôn join** `tenants` và lọc `tenants.status = 'active'`. Với PostgreSQL, partial index `WHERE status = 'active'` trên cả hai bảng làm join này rẻ ở quy mô MVP (1.000 shop).

Đổi lại: khoá tenant có hiệu lực **tức thì** trên marketplace, chỉ bằng một `UPDATE` một dòng. Đây là hành vi đúng cho một thao tác kiểm duyệt.

### 4. Giá vẫn đọc từ listing, nhưng đơn giá thật lấy từ `vehicle_pricing` lúc tạo booking

Listing giữ giá để **search/sort/hiển thị**. Nhưng khi tạo booking, `PricingService` tính lại từ `vehicle_pricing` — không tin giá trên listing. Nếu lệch (do sync trễ), ưu tiên giá thật và ghi cảnh báo vào log để phát hiện sync hỏng.

## Test bắt buộc ở Phase 3

1. Khoá tenant → listing của tenant đó biến khỏi kết quả search ngay, không cần job nào chạy.
2. Sửa giá xe đã approved → listing về `hidden`, xuất hiện trong hàng chờ duyệt lại.
3. Xoá mềm xe → listing `archived`, không search ra, và **không đặt được** kể cả gọi thẳng API bằng `listing_id` cũ.
4. Duyệt xe → listing xuất hiện với đúng dữ liệu snapshot.

## Hệ quả

- `ListingsService` phụ thuộc `VehiclesService` và `ApprovalService` — chấp nhận, vì đổi lại là chỉ có một chỗ để đọc khi debug "vì sao xe này còn/không hiện ngoài chợ".
- Có một script `verify:listings` đối chiếu `public_listings` với `vehicles` và báo lệch. Chạy trong CI trên seed data, và chạy tay trên production khi nghi ngờ.
