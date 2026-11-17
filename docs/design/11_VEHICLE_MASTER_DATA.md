# 11 · Dữ liệu xe — nguồn gợi ý cho chủ xe khi đăng xe

> Cập nhật: 11/11/2026 (thiết kế lại theo góp ý người dùng) · Quyết định:
> [ADR 0090](../decisions/0090-vehicle-master-data-catalog.md) · Liên quan:
> [ADR 0088](../decisions/0088-mic-trip-insurance-integration.md) (giá trị xe cho bảo hiểm),
> [`10_ADMIN_INSURANCE.md`](10_ADMIN_INSURANCE.md)

## 1. Mục tiêu

Một bộ dữ liệu chuẩn cho **mỗi xe**: thông số cấu hình, tiện ích, giá bán tham khảo, giá thuê tham
khảo. Khi chủ xe đăng xe và chọn hãng → dòng xe → phiên bản, form **gợi ý** (như Mioto) chứ không tự
điền: chủ xe bấm "Áp dụng thông số", "Dùng giá trị này", "Dùng giá" thì mới vào xe.

Dữ liệu lớn dần theo hai đường:

1. **Vận hành nhập**: thêm từng xe ở màn quản trị, hoặc nhập cả danh sách từ file Excel.
2. **Chủ xe mang về**: chủ xe đăng một xe chưa có trong dữ liệu ⇒ hệ thống tự ghi nhận một dòng
   "Chờ duyệt" lấy thông số, tiện ích, giá từ chính chiếc xe đó; vận hành duyệt thì dòng đó bắt đầu
   gợi ý cho chủ xe sau.

## 2. Một dòng = một xe

| Nhóm | Trường |
| --- | --- |
| Nhận dạng | Loại xe · Hãng · Dòng xe · **Phiên bản** (để trống nếu xe chỉ có một bản) · **Năm từ – Năm đến** (đời bán tại VN; năm đến trống = còn bán) |
| Thông số | Số chỗ · Kiểu dáng (ô tô) · Nhiên liệu · Hộp số · Dung tích · Công suất · Dài/Rộng/Cao · Trọng lượng · Tiêu hao · Quãng đường điện · Pin |
| Tiện ích | Danh sách tiện ích có sẵn của xe |
| Giá bán tham khảo | Giá bán xe mới |
| Giá thuê tham khảo | Tự lái theo giờ · ngày thường · cuối tuần · theo tháng · Có tài xế / ngày — **mỗi ô ứng đúng một ô giá của form xe** |
| Hiển thị | Đang gợi ý / Ẩn |

Nhận dạng duy nhất: **(dòng xe, phiên bản, năm từ)**. "Vios 1.5 G CVT 2018–2022" và "Vios 1.5 G CVT
2023–nay" là hai xe khác nhau. Thông số mang đúng tên cột của `vehicles`, nên "Áp dụng" là phép chép
thẳng.

Không có cột "nguồn": giá và thông số là dữ liệu vận hành đã chốt. Ai sửa, lúc nào nằm ở nhật ký
(audit) và ở cột "Cập nhật" của màn quản trị.

## 3. Màn quản trị "Dữ liệu xe"

> ⚠️ Cập nhật 17/11/2026 (ADR 0096): màn này KHÔNG còn menu riêng. Nó nằm ở tab **Mẫu xe** của
> **Danh mục** (`/admin/catalog?type=vehicle_model`): chọn loại xe, chọn hãng bên trái, bên phải là
> MỘT danh sách — mỗi dòng xe một hàng, bấm để xổ ra các xe chuẩn của dòng; dòng có xe chờ duyệt / thiếu
> thông số tự mở. Toàn bộ mục 3.1 – 3.x dưới đây giữ nguyên chức năng, trong phạm vi loại xe + hãng đang
> chọn; loại xe và hãng không còn là bộ lọc. Cùng quyền `platform.catalog.manage`. Dữ liệu, API và phần
> gợi ý cho chủ xe giữ nguyên. Chi tiết bố cục: ADR 0096 điều 2-3.

### 3.1 Danh sách

- **Dải số liệu** (bấm để lọc nhanh): Tổng số xe · Đang gợi ý · **Chờ duyệt** · **Thiếu dữ liệu**
  (đang gợi ý nhưng thiếu thông số / giá bán / giá thuê) · Đã ẩn.
- **Bộ lọc** (trên URL): tìm theo hãng/dòng/phiên bản · loại xe · hãng · trạng thái · thiếu dữ liệu
  (thông số / giá bán / giá thuê / bất kỳ) · nguồn tạo (admin / nhập file / từ chủ xe) · sắp xếp (mới
  cập nhật / theo tên / nhiều xe dùng nhất). Lọc, sắp, phân trang ở server.
- **Cột**: Xe (hãng dòng · phiên bản · đời, nhãn "Dòng xe mới" nếu chủ xe gõ) · Thông số tóm tắt · Giá
  bán mới · Giá thuê/ngày (tham khảo + **giá thực tế** của các xe đang dùng dữ liệu này trên chợ; lệch
  từ 15% trở lên thì tô màu "Thực tế cao/thấp hơn n%") · Số xe đang dùng · Trạng thái + nguồn tạo ·
  Đầy đủ (thiếu gì) · Cập nhật.

Dữ liệu chủ xe gửi lên nằm **chung danh sách** với dữ liệu nhập/tạo tay, chỉ khác trạng thái "Chờ
duyệt" — không có tab đề xuất riêng.

### 3.2 Panel làm việc (bấm một dòng · `?open=<id>`; "Thêm xe" = `?open=new`)

- **Bên trái — sửa trực tiếp** toàn bộ trường của mục 2. Dòng xe chọn từ danh sách hoặc gõ tên mới
  ("Thêm dòng xe …" ⇒ tạo khi lưu). Đổi dòng xe của một dữ liệu = các xe đang dùng nó dời theo.
- **Bên phải — tình hình sử dụng**: trạng thái, nguồn tạo, gian hàng (nếu từ chủ xe), ai cập nhật lúc
  nào · **xe gốc của chủ xe** · các xe đang dùng (tối đa 10, link sang Tất cả xe) · **giá thực tế
  trên chợ** cho từng ô giá (P25 – P75, trung vị, số xe) đặt cạnh giá tham khảo · **giá trị xe tham khảo
  theo năm** (ô tô) · **có thể trùng** (cùng dòng, cùng phiên bản hoặc đời chồng nhau).
- **Chân panel**:
  - Đang gợi ý / Ẩn: **Lưu** · **Xoá** (chỉ khi chưa xe nào dùng; có xe thì tắt "Đang gợi ý").
  - Chờ duyệt: **Lưu và duyệt** · Lưu · **Gộp vào xe có sẵn** · **Từ chối** (kèm lý do).
  - Quyết định xong panel tự sang dữ liệu kế tiếp.

### 3.3 Duyệt dữ liệu chủ xe gửi lên

| Việc | Kết quả |
| --- | --- |
| **Duyệt** (sửa trước nếu cần) | Bắt đầu gợi ý. Dòng xe chủ xe gõ mới (nếu có) được duyệt theo. |
| **Gộp vào xe có sẵn** | Các xe đang dùng trỏ sang xe đích (dòng xe + tên hãng/dòng chép lại, ảnh chụp chợ đồng bộ). Dữ liệu chờ bị đóng; dòng xe mới không còn ai dùng thì gỡ. |
| **Từ chối** (lý do) | Xe bỏ liên kết phiên bản nhưng giữ tên hãng/dòng chủ xe đã gõ. Dòng xe mới không còn dữ liệu nào thì bị từ chối theo. |

Mẹo xử lý thường gặp: chủ xe gõ "Vios G" thành một **dòng xe** mới → mở dữ liệu đó, đổi Dòng xe sang
"Vios", Phiên bản "1.5 G CVT", rồi Lưu và duyệt — xe của chủ xe tự dời sang đúng dòng.

## 4. Nhập / xuất file

**Một định dạng duy nhất**, một sheet "Dữ liệu xe", mỗi dòng một xe, các cột theo đúng mục 2:

`Mã · Loại xe · Hãng · Dòng xe · Phiên bản · Năm từ · Năm đến · Số chỗ · Kiểu dáng · Nhiên liệu ·
Hộp số · Dung tích (cc) · Công suất (hp) · Dài/Rộng/Cao (mm) · Trọng lượng (kg) · Tiêu hao (L/100km) ·
Quãng đường điện (km) · Pin (kWh) · Tiện ích · Giá bán mới · Giá thuê theo giờ · Giá thuê ngày thường ·
Giá thuê cuối tuần · Giá thuê theo tháng · Giá có tài xế / ngày · Trạng thái`

- **File mẫu** có ô chọn sẵn (loại xe, kiểu dáng, nhiên liệu, hộp số, trạng thái), sheet "Hướng dẫn"
  liệt kê giá trị nhận, kèm hai dòng ví dụ (VinFast VF 5 Plus, Honda Vision).
- **Xuất file** theo đúng bộ lọc đang xem, cùng định dạng; có cột **Mã** để nhập lại khớp đúng xe (đổi
  tên/đời được). Xuất rồi nhập lại nguyên file ⇒ mọi dòng "Không đổi".
- **Luật nhập**: có Mã ⇒ cập nhật đúng xe đó; không Mã ⇒ khớp theo (loại xe, hãng, dòng, phiên bản,
  năm từ), không khớp thì thêm mới. **Ô trống = giữ nguyên**; file không bao giờ xoá dữ liệu. Hãng,
  dòng xe chưa có ⇒ tạo mới (báo trước). Giá trị chữ nhận nhãn tiếng Việt hoặc mã. Tiện ích cách nhau
  bằng ";", tiện ích lạ bị bỏ (cảnh báo). Dữ liệu đang chờ duyệt: cột Trạng thái bị bỏ qua.
- **Luồng**: tải lên ⇒ **xem trước** từng dòng (thêm mới · cập nhật với danh sách ô "cũ → mới" · không
  đổi · lỗi + lý do) ⇒ **Áp dụng** (một transaction, dòng lỗi bỏ qua) hoặc huỷ. Bản xem trước hết hạn
  sau 24 giờ. Giới hạn 5 MB, 5.000 dòng, `.xlsx` hoặc `.csv` UTF-8.
- **Lịch sử nhập file** (menu "…" đầu màn): ai, lúc nào, file nào, kết quả; mở lại xem từng dòng.

## 5. Gợi ý phía chủ xe

Form đăng/sửa xe (web: tạo xe, sửa xe, wizard đăng nhanh):

1. **Hãng → Dòng xe → Phiên bản**. Không thấy dòng xe/phiên bản: **gõ ngay trong ô** ("Thêm dòng xe
   …", "Thêm phiên bản …") — không hộp thoại. Dòng xe gõ mới được tạo ngay (chờ duyệt, chỉ xe đó thấy);
   phiên bản gõ mới đi kèm lượt lưu xe.
2. Ô Phiên bản ưu tiên xe chuẩn **hợp đời** với năm sản xuất; không có xe chuẩn nào hợp đời thì vẫn
   hiện mọi phiên bản của dòng (nhãn có đời để chủ xe tự thấy chênh).
3. **Thẻ "Thông số tham khảo"** (xe chuẩn đã chọn, hoặc xe chuẩn duy nhất của dòng) — nút **Áp dụng
   thông số**: chép thông số, tiện ích được CỘNG vào tiện ích đã chọn.
4. **Giá trị xe tham khảo** (ô tô, dưới ô "Giá trị xe") = giá bán mới × khấu hao theo tuổi xe (năm đầu
   −10%, mỗi năm sau −4%, sàn 30% — hiệu chỉnh theo giá xe cũ, bảng ở mục 7), làm tròn triệu, kẹp trong
   khoảng bảo hiểm nhận — nút **Dùng giá trị này**.
5. **Dưới từng ô giá**: "Giá tham khảo XePrime: …" + nút **Dùng …** (của xe chuẩn đã chọn; chưa chọn thì
   trung vị các xe chuẩn cùng dòng) và "Xe cùng dòng đang cho thuê: P25 – P75 (n xe)" khi chợ có từ 5
   xe cùng dòng, đời ±3 năm. Wizard đăng nhanh không có gì thì rơi về gợi ý cũ theo phân khúc + tỉnh.

### Tự ghi nhận từ xe của chủ xe

Khi lưu xe (tạo, sửa, sửa giá), trong CÙNG transaction:

| Tình huống | Việc |
| --- | --- |
| Gõ phiên bản mới | Có xe chuẩn cùng tên (đã duyệt hoặc đang chờ) ⇒ gắn xe vào đó. Không có ⇒ tạo dòng **chờ duyệt** lấy thông số, tiện ích, giá thuê từ xe; đời = năm sản xuất. |
| Không chọn phiên bản, dòng xe còn mới (chủ xe gõ) hoặc dòng chưa có dữ liệu nào | Như trên với phiên bản trống. |
| Dòng chờ duyệt do chính xe này tạo | Sửa xe/sửa giá ⇒ dòng đó cập nhật theo, tới khi admin duyệt. |
| Xe rời khỏi dòng chờ duyệt nó đã tạo và không còn ai dùng | Dòng đó bị dọn. |

Không bao giờ chặn lượt lưu xe: quá **20 dữ liệu mới / gian hàng / 24 giờ** (dòng xe gõ mới + dữ liệu
tự ghi nhận) thì chỉ bỏ qua bước ghi nhận. Dữ liệu chờ duyệt không gợi ý cho ai, kể cả chính xe đã tạo
ra nó.

## 6. Nguồn dữ liệu khởi đầu (11/11/2026)

File `XePrime_DuLieuXe_2026-11.xlsx` (đã nhập vào DB dev, 128 dòng):

- **Thông số + giá bán mới**: tổng hợp từ bảng giá hãng/báo ô tô tháng 6–11/2026 cho các dòng xe cho
  thuê phổ biến (Toyota, Hyundai, Kia, Mitsubishi, Honda, Mazda, Ford, Suzuki, VinFast; xe máy Honda,
  Yamaha, VinFast). Năm giá cần đối chiếu lại trên website hãng: Vios G CVT, Veloz Cross Top, Avanza CVT,
  Corolla Cross HEV, Yaris Cross HEV.
- **Giá thuê chuẩn**: từ file khảo sát của đội (`4.1.Data_XePrime_Banggiathuexechuan.xlsx`) — trung vị
  cột "Giá chuẩn" của các dòng nhắc **đúng một** dòng xe (khách lẻ, ngày thường, tự lái); dòng xe không
  có quan sát riêng lấy trung vị nhóm xe ("Mã nhóm"). Cuối tuần = ngày thường +10% (khảo sát: +10–20%).
  Xe máy chỉ có giá ngày.
- Dòng xe chỉ có giá thuê (Cerato, Sedona, 3 Series, S-Class, MG ZS…) vào với phiên bản trống, thiếu
  thông số — hiện ở bộ lọc "Thiếu dữ liệu" để vận hành bổ sung.

Cập nhật định kỳ: xuất file theo hãng → sửa giá trong Excel → nhập lại (xem trước cho thấy đúng các ô
đổi).

## 7. Khấu hao giá trị xe (hiệu chỉnh 11/11/2026)

Theo giá rao xe cũ tháng 8/2026 (Chợ Tốt, Bonbanh):

| Xe | Tuổi | Thị trường ≈ | −10%/−4% (đang dùng) | −15%/−8% (bản đầu) |
| --- | --- | --- | --- | --- |
| Vios 2022 | 4 | 76% | 78% | 61% |
| Vios 2020 | 6 | 66% | 70% | 45% |
| Vios 2018 | 8 | 60% | 62% | 30% |
| Xpander 2022 | 4 | 81% | 78% | 61% |
| Xpander 2019 | 7 | 70% | 66% | 34% |

## 8. Kỹ thuật

| Phần | Ở đâu |
| --- | --- |
| Bảng | `vehicle_catalog_variants` (một dòng = một xe chuẩn: thông số, tiện ích, `list_price`, 5 cột giá thuê, `review_status`, `origin`, `source_vehicle_id`) · `vehicle_catalog_imports` (bản xem trước + lịch sử) · `vehicles.vehicle_catalog_variant_id` · `vehicle_catalog_models.review_status` (dòng xe chủ xe gõ). Migration `20261111120000_vehicle_master_data`. Unique một phần `(model_id, key, coalesce(year_from,0)) WHERE deleted_at IS NULL`. |
| Writer | `VehicleDataService` (mọi ghi xe chuẩn, kể cả tự ghi nhận + nhập file) · `CatalogModelService` (dòng xe: gõ mới, duyệt, gỡ) · `CatalogService.ensureBrandWithinTx` (hãng mới từ file) |
| API quản trị | `GET/POST /platform/vehicle-data` · `GET/PATCH/DELETE /platform/vehicle-data/:id` · `POST …/:id/approve|merge|reject` · `GET /platform/vehicle-data/template|export` · `GET/POST /platform/vehicle-data/imports` · `GET …/imports/:id[/rows]` · `POST …/imports/:id/apply|discard` |
| API chủ xe | `GET /catalog/variants` (công khai, ô Phiên bản) · `GET /vehicle-catalog/suggestion` (gợi ý) · `POST /vehicle-catalog/models` (dòng xe gõ mới) · lưu xe nhận thêm `catalogVariantLabel` |
| Luật dùng chung | `packages/types/src/vehicle-master-data.ts` (trạng thái, nhóm thiếu dữ liệu, mã vấn đề nhập file, khấu hao, giá trị xe) |
| Web | `apps/web/src/features/vehicle-data/` (màn quản trị + hook phía chủ xe) · `features/vehicles/components/{VehicleIdentityFields,CatalogSuggestions}.tsx` · `SelectField` `creatable` |
| Test | `apps/api/test/vehicle-data.spec.ts` (DB thật) · `vehicle-data-import.unit.spec.ts` · `packages/types/src/vehicle-master-data.test.ts` · web `vehicle-data-view.test.tsx`, `catalog-suggestion.test.tsx` |

## 9. Lộ trình

| Đợt | Việc |
| --- | --- |
| 1 (đã làm) | Màn Dữ liệu xe, nhập/xuất file, tự ghi nhận + duyệt, gợi ý trên form web |
| 2 | App Partner (mobile): ô Phiên bản + gợi ý (server đã sẵn, trường tuỳ chọn) |
| 3 | Cảnh báo giá trị xe khai lệch giá trị tham khảo quá ±40% ở hàng đợi bảo hiểm (tài liệu `10` §6) |
| 4 | Giá xe cũ theo năm đời (nếu khấu hao chung lệch nhiều ở một dòng xe); tự duyệt khi nhiều chủ xe khai trùng |
