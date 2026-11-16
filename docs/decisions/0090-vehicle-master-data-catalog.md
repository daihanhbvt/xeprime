# ADR 0090 — Dữ liệu xe: mỗi dòng một xe (thông số, tiện ích, giá bán, giá thuê tham khảo), màn quản trị riêng, tự ghi nhận từ xe của chủ xe, gợi ý không tự điền

Ngày: 11/11/2026 · Trạng thái: **Accepted** (11/11/2026, thiết kế lại cùng ngày theo góp ý người dùng:
dữ liệu xe là MỘT màn quản lý riêng chứ không nằm trong Danh mục bộ lọc; dữ liệu chủ xe gửi lên nằm
chung danh sách; một file đủ thông tin của một xe, không cần nguồn) · Người dùng chốt: một xe = hãng +
dòng + phiên bản + đời; xe chưa có thì tự ghi nhận khi chủ xe lưu xe; mỗi loại giá thuê một giá chuẩn;
dùng chung quyền Danh mục; dữ liệu chỉ để GỢI Ý như Mioto · Mở rộng: `vehicle_catalog_models` ·
Phục vụ: [0088](0088-mic-trip-insurance-integration.md) (giá trị xe) · Tài liệu:
[`design/11_VEHICLE_MASTER_DATA.md`](../design/11_VEHICLE_MASTER_DATA.md)

## Bối cảnh

Danh mục chỉ dừng ở DÒNG xe (số chỗ/nhiên liệu/hộp số cấp dòng) — là bộ lọc của chợ. Không có thông
số chi tiết theo phiên bản, giá bán, giá thuê tham khảo; chủ xe đăng xe phải tự gõ hết, dòng xe chưa có
thì kẹt. Bảo hiểm MIC (ADR 0088) bắt buộc giá trị xe mà chủ xe phải tự đoán. Đội vận hành có file khảo
sát giá thuê và muốn quản lý dữ liệu xe bằng Excel.

Bản đầu của ADR này (cùng ngày) gắn phiên bản + giá năm đời + giá thuê quan sát + đề xuất từ chủ xe vào
các tab của màn Danh mục. Người dùng không đồng ý: dữ liệu xe phải là một màn quản lý riêng, một danh
sách, một file đủ thông tin mỗi xe. Bản đầu chưa lên môi trường nào; migration được viết lại.

## Quyết định

1. **Một dòng = một xe chuẩn**: dòng xe + phiên bản (trống = không phân biệt) + đời (năm từ – năm đến),
   mang thông số theo đúng cột của `vehicles`, mã tiện ích, **giá bán xe mới**, và **năm giá thuê tham
   khảo** ứng đúng năm ô giá của form xe (giờ · ngày thường · cuối tuần · tháng · có tài xế/ngày). Bảng
   `vehicle_catalog_variants`; nhận dạng duy nhất (dòng, phiên bản, năm từ) trong các dòng còn sống
   (unique một phần). `vehicles.vehicle_catalog_variant_id` tuỳ chọn, phải thuộc đúng dòng của xe.
   Không lưu nguồn: ai sửa lúc nào nằm ở audit.
2. **Màn quản trị riêng "Dữ liệu xe"** (khối Chợ xe, quyền `platform.catalog.manage` + `@PlatformOnly`):
   một danh sách lọc/sắp/phân trang ở server, dải số liệu (tổng · đang gợi ý · chờ duyệt · thiếu dữ liệu
   · đã ẩn), panel làm việc sửa trực tiếp mọi trường + tình hình sử dụng (xe đang dùng, giá thực tế
   trên chợ, giá trị theo năm, dữ liệu có thể trùng). Màn Danh mục giữ nguyên vai trò bộ lọc.
3. **Tự ghi nhận từ xe của chủ xe**: chủ xe gõ dòng xe/phiên bản chưa có ngay trong ô chọn (không hộp
   thoại). Dòng xe gõ mới tạo ngay ở trạng thái `pending` (chỉ xe đang gắn thấy, `POST
   /vehicle-catalog/models`). Khi lưu xe — trong CÙNG transaction tạo/sửa xe/sửa giá — server gắn xe vào
   xe chuẩn cùng tên nếu có, không thì tạo một dòng `pending` lấy thông số, tiện ích, giá thuê từ chính
   xe đó (`source_vehicle_id`); dòng chờ do xe đó tạo cập nhật theo xe tới khi duyệt. Không chọn phiên
   bản mà dòng xe còn mới hoặc chưa có dữ liệu nào ⇒ ghi nhận với phiên bản trống. Trần 20 dữ liệu mới /
   gian hàng / 24 giờ; quá trần chỉ bỏ qua bước ghi nhận, không chặn lưu xe.
4. **Dữ liệu chờ duyệt nằm chung danh sách**, không tab riêng. Admin sửa rồi **duyệt** (dòng xe mới duyệt
   theo) / **gộp** vào xe chuẩn đã có (xe đang gắn trỏ sang, ảnh chụp chợ đồng bộ — ADR 0008) / **từ
   chối** kèm lý do (xe bỏ liên kết, giữ tên đã gõ). Đổi dòng xe của một dữ liệu = dời xe đang gắn theo.
   Dòng xe mới không còn dữ liệu nào sống thì bị gỡ.
5. **Một định dạng file**: một sheet, mỗi dòng một xe đủ cột như điều 1, cột **Mã** để khớp đúng xe khi
   nhập lại file đã xuất. Tải lên chỉ XEM TRƯỚC (thêm mới · cập nhật kèm danh sách ô cũ → mới · lỗi),
   áp dụng lập lại kế hoạch trên dữ liệu hiện tại rồi ghi trong MỘT transaction + audit; ô trống giữ
   nguyên, không bao giờ xoá qua file, hãng/dòng xe chưa có thì tạo. File mẫu có ô chọn sẵn + hướng dẫn;
   xuất theo bộ lọc đang xem. Lịch sử các lượt nhập ở `vehicle_catalog_imports`.
6. **Gợi ý, không tự điền**: `GET /vehicle-catalog/suggestion` (realm partner) trả xe chuẩn khớp (đã chọn,
   hoặc xe chuẩn duy nhất của dòng), giá trị xe tham khảo (ô tô), và cho từng ô giá: giá tham khảo (của
   xe chuẩn; chưa chọn thì trung vị các xe chuẩn cùng dòng) + giá thực tế của xe cùng dòng, đời ±3 năm
   đang lên chợ khi đủ 5 xe. Form chỉ điền khi chủ xe bấm Áp dụng / Dùng. Ô "Phiên bản" ưu tiên xe chuẩn
   hợp đời; không có thì hiện mọi phiên bản của dòng.
7. **Giá trị xe tham khảo** = giá bán mới × khấu hao tuổi xe (năm đầu −10%, mỗi năm −4%, sàn 30% —
   hiệu chỉnh theo giá rao xe cũ, bảng ở design 11 §7), làm tròn 1 triệu, kẹp khoảng bảo hiểm nhận. Chỉ
   ô tô (xe máy không có VCX).
8. **Writer**: `VehicleDataService` là đường ghi DUY NHẤT của `vehicle_catalog_variants` (admin, nhập
   file và tự ghi nhận đều qua `saveWithinTx`); `CatalogModelService` ghi dòng xe (gõ mới, duyệt, gỡ,
   tạo từ admin/file); `CatalogService.ensureBrandWithinTx` tạo hãng mới từ file. Thông số được nới vào
   mảng cấp dòng xe (chỉ mảng đã có giá trị) để luật khoá thông số của form không chặn nhầm.

## Hệ quả

- Chủ xe không còn kẹt ở dòng xe thiếu; dữ liệu họ khai thành nguồn bổ sung sau khi vận hành duyệt.
- Vận hành thấy ngay dữ liệu nào thiếu, giá tham khảo nào lệch giá thực tế trên chợ.
- Giá trị bảo hiểm có điểm tựa; có cơ sở cảnh báo giá trị khai bất thường (đợt sau).
- Thêm phụ thuộc `exceljs` ở `apps/api` (đọc/ghi xlsx; MIT).
- App Partner (mobile) không vỡ: trường mới đều tuỳ chọn; app chưa có ô phiên bản/gợi ý.

## Cần xem lại khi

Có nguồn giá xe trả phí đáng tin; cần giá xe cũ theo từng năm đời cho một dòng xe giữ giá khác thường;
cần gợi ý theo khu vực/mùa; tỉ lệ dữ liệu rác từ chủ xe cao (siết trần) hoặc nhiều chủ xe khai trùng
(cân nhắc tự duyệt).
