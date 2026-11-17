# ADR 0096 — Gộp màn "Dữ liệu xe" vào tab "Mẫu xe" của Danh mục

Ngày: 16/11/2026 · Trạng thái: **Accepted** (16/11/2026, người dùng chốt trong đợt rà Admin: "gom về Danh
mục, bỏ Dữ liệu xe, giữ data và đủ chức năng của Dữ liệu xe, giao diện hãng bên trái - danh sách xe bên
phải") · Ghi đè: [0090](0090-vehicle-master-data-catalog.md) **điều 2** (màn quản trị riêng). Các điều còn lại
của ADR 0090 (một dòng = một xe chuẩn, tự ghi nhận từ xe chủ xe, nhập/xuất file, gợi ý không tự điền,
giá trị xe tham khảo, writer) giữ nguyên.

## Bối cảnh

Sau ADR 0090, mẫu xe được quản lý ở HAI nơi:

- **Danh mục → Mẫu xe**: dòng xe theo hãng (hãng bên trái, dòng xe bên phải), thông số cấp dòng, nhóm
  "Đang phân phối / Đời trước", nguồn đối chiếu.
- **Dữ liệu xe**: xe chuẩn (dòng + phiên bản + đời) với thông số chi tiết, giá bán, giá thuê tham khảo,
  dữ liệu chờ duyệt từ chủ xe, nhập/xuất file.

Hai nơi cùng sửa một bảng dòng xe (`vehicle_catalog_models`) nhưng không thấy nhau: sửa tên dòng ở Danh
mục thì màn Dữ liệu xe không làm mới; người vận hành phải nhớ việc nào làm ở màn nào.

## Quyết định

1. **Một nơi duy nhất: tab "Mẫu xe" của Danh mục** (`/admin/catalog?type=vehicle_model`). Màn và menu
   "Dữ liệu xe" (`/admin/vehicle-data`) gỡ hẳn, không giữ đường chuyển tiếp (người dùng chọn xoá các URL
   cũ trong cùng đợt).
2. **Bố cục giữ khung của Danh mục, bên phải là MỘT danh sách dòng xe → xe** (sửa 17/11/2026 — bản
   16/11 tách hai chế độ xem "Xe" / "Dòng xe" bằng một nút chuyển; người dùng thấy khó hiểu vì hai thứ
   lồng nhau, và chọn gộp kiểu "dòng là nhóm, xe xổ ra"). Chọn loại xe → HÃNG bên trái → bên phải:
   - mỗi **dòng xe** một hàng, chia nhóm "Đang phân phối" / "Mẫu xe đời trước" / "Dòng xe mới chờ
     duyệt" (dòng chủ xe gõ khi đăng xe, chỉ biết qua xe chuẩn của nó): thông số cấp dòng, số xe, số
     xe chờ duyệt / thiếu dữ liệu, dòng thiếu thông số GỌI TÊN thứ còn thiếu, nguồn đối chiếu, trạng
     thái; hành động Thêm xe (điền sẵn dòng) · Sửa dòng · Xoá;
   - bấm hàng là **xổ ra các xe chuẩn** của dòng (phiên bản · đời, thông số, giá bán, giá thuê tham khảo,
     trạng thái, thiếu dữ liệu) — tải riêng theo `modelId`, phân trang ở server trong dòng; bấm một xe
     mở panel làm việc (sửa · duyệt · gộp · từ chối · xoá, trước/sau theo thứ tự đang thấy);
   - dòng có xe chờ duyệt, dòng thiếu thông số, và dòng khớp bộ lọc xe **tự mở sẵn**;
   - trên đó: hành động (file mẫu, lịch sử nhập, xuất file theo bộ lọc đang xem, nhập file, thêm dòng
     xe), dải số liệu (tổng · đang gợi ý · chờ duyệt · thiếu dữ liệu · **dòng thiếu thông số** · đã
     ẩn — bấm là lọc), bộ lọc (tìm dòng + phiên bản, trạng thái xe, thiếu dữ liệu, thông số dòng, nguồn,
     cách xếp xe trong dòng). Mọi bộ lọc nằm trên URL; tham số `view` của bản 16/11 bị bỏ qua.
3. **Dòng nào hiện, mở và đếm bao nhiêu là do SERVER đếm theo dòng**
   (`GET /platform/vehicle-data/model-counts`, `VehicleDataQueryService.modelCounts`: tổng · đang gợi
   ý · đã ẩn · chờ duyệt · thiếu dữ liệu · khớp bộ lọc, theo từng dòng của một hãng — `groupBy` ở DB),
   không suy từ trang xe đang tải. Dải số liệu là tổng của các con số đó. Cột hãng hiện thêm số xe và
   số xe chờ duyệt của từng hãng (`brandSummary.vehicleDataTotal/Pending`) để người duyệt biết hãng
   nào có việc mà không phải bấm từng hãng.
4. **Hai bên làm mới nhau**: mọi ghi ở Dữ liệu xe làm mới nhánh `catalog` (đã có), mọi ghi dòng xe làm
   mới nhánh `vehicleData`.
5. API không đổi đường: `/platform/vehicle-data/*` và `/platform/catalog/models*` giữ nguyên (thêm
   `model-counts`), quyền `platform.catalog.manage` giữ nguyên. Phía chủ xe (gợi ý, ô chọn phiên bản)
   không bị ảnh hưởng.
6. **Không xoá được dòng xe còn xe chuẩn sống** (`CATALOG_MODEL_HAS_VEHICLE_DATA`, 409, kiểm trong
   transaction đã khoá dòng). Trước đây hai thứ ở hai màn nên xoá dòng ở Danh mục âm thầm để lại xe chuẩn
   mồ côi — chúng biến khỏi danh sách (vốn chỉ đọc dòng còn sống) mà vẫn giữ định danh. Xoá / gộp xe
   chuẩn trước, hoặc tắt dòng.

## Hệ quả

- Người vận hành làm mọi việc về mẫu xe ở một màn, theo cách duyệt quen thuộc: chọn hãng rồi làm việc.
- Danh sách xe vẫn phân trang ở server (trong từng dòng), nên một hãng có hàng trăm phiên bản không
  làm chậm màn; số đếm theo dòng đo 17/11/2026 trên 120.000 xe chuẩn với cấu hình planner production:
  ~1-3ms mỗi câu, dùng chỉ mục có sẵn.
- Thứ cần làm (xe chờ duyệt, dòng thiếu thông số) hiện ngay khi chọn hãng, không phải đổi chế độ xem
  hay bật bộ lọc mới thấy.
- Link cũ `/admin/vehicle-data` thành 404 (chấp nhận theo chọn lựa của người dùng).

## Cần xem lại khi

Số dữ liệu chờ duyệt lớn tới mức cần một hàng đợi duyệt xuyên hãng (khi đó thêm lối "Mọi hãng" ở cột
hãng thay vì dựng lại màn riêng).
