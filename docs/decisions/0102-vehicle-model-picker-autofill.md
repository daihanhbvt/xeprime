# ADR 0102 - Thêm xe: một ô "Mẫu xe" gộp dòng + phiên bản, tự điền và khoá thông số, tên xe tự ghép

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 - người dùng chốt khi thử màn thêm xe trên
staging: "đã có bộ dữ liệu xe chuẩn rồi thì cần gì nhập tên xe; select search lấy từ data, mục cuối là
nhập tay; đủ hãng + mẫu thì các ô sau tự điền dạng khoá, có icon sửa") · Ghi đè:
[0090](0090-vehicle-master-data-catalog.md) **điều 6** trong phạm vi "thông số chỉ gợi ý, bấm Áp dụng mới
điền" · Liên quan: [0089](0089-vehicle-registration-at-car-create.md) · [0100](0100-vehicle-registration-photo-optional.md)

## Bối cảnh

Từ ADR 0090, form xe hỏi riêng ba ô Hãng → Dòng xe → Phiên bản, rồi hiện một thẻ "Thông số tham khảo"
với nút "Áp dụng thông số". Chủ xe vẫn phải tự gõ tên xe, dù tên đó suy thẳng ra từ hãng, dòng, phiên bản
và năm. Khi staging đã có dữ liệu xe chuẩn (18/11/2026), người dùng thấy ba điều thừa: ô tên xe, bước bấm
"Áp dụng", và việc chọn dòng rồi mới chọn phiên bản. Màn của đối tác bảo hiểm (MIC) chỉ có một ô "Hiệu xe"
gọn ("VF5 PLUS").

## Quyết định

1. **Một ô "Mẫu xe" gộp** thay cho cặp Dòng xe → Phiên bản: chọn hãng, rồi tìm (không dấu) trong danh sách
   mọi xe chuẩn đã duyệt của hãng đó, chia nhóm "Đang phân phối" / "Mẫu xe đời trước". Nhãn gọn như hãng
   gọi xe ("VF 5 Plus"). **Đời** chỉ thêm khi cùng một phiên bản có nhiều đời ("Vios 1.5G CVT · 2018 -
   2022" và "· 2023 - nay"). Dòng xe chưa có xe chuẩn nào hiện riêng tên dòng. Nguồn:
   `GET /catalog/variants?brandKey&vehicleType` (`VehicleDataService.listBrandOptions`, trần 500 mỗi
   hãng; `modelId` vẫn dùng được như cũ).
2. **Mục cuối "Nhập tay"** mở lại cặp ô Dòng xe → Phiên bản của ADR 0090: gõ được dòng mới (tạo ngay, chờ
   duyệt) và phiên bản mới (server tự ghi nhận). Xe đang mang phiên bản gõ tay thì mở sẵn chế độ này.
3. **Chọn một xe chuẩn ⇒ thông số được ĐIỀN NGAY** (ghi đè, vì chủ xe vừa nói "xe tôi là bản này"): số chỗ,
   kiểu dáng, nhiên liệu, hộp số, dung tích, công suất, kích thước, trọng lượng, tiêu hao, pin, quãng đường
   điện. Tiện ích được CỘNG thêm. Năm sản xuất nằm ngoài đời của phiên bản ⇒ cảnh báo dưới ô, không chặn.
   **Giá trị xe và giá thuê vẫn là GỢI Ý** kèm nút "Dùng": chủ xe là người khai giá trị với hãng bảo hiểm.
4. **Ô đã tự điền thì khoá**, khoá là trạng thái giao diện chứ không phải luật server. Ô khoá khi giá trị
   của nó KHỚP xe chuẩn đang chọn, hoặc khi dòng xe chỉ có một cấu hình (`catalogSpecRule`). Xe cũ lưu lệch
   thì không khoá. Mọi ô khoá có **một hình dạng**: ô chỉ đọc, giá trị đã định dạng, **bút nằm trong ô**
   (`LockedValueField`, dùng chung với các ô cà vẹt). Bấm bút mở riêng ô đó cho tới khi đổi mẫu xe.
   Hộp số "1 cấp" của xe điện vẫn khoá cứng, vì không có lựa chọn nào khác.
5. **Tên xe tự ghép**: màn thêm xe (cả wizard nâng cao lẫn luồng đăng nhanh) không còn ô tên. Server ghép
   "Hãng Dòng Phiên bản Năm" khi request không mang tên (`composeVehicleName` ở `@xeprime/types`; nhãn đọc
   từ danh mục ở DB, không tin chữ client). Không có tên, cũng không có dòng xe ⇒ 400
   `VEHICLE_NAME_REQUIRED`. Vì vậy **hãng + mẫu xe bắt buộc ngay cả khi lưu nháp** trên web
   (`vehicleCreateFormSchema`). Khung xem trước và hộp xác nhận hiện đúng tên sẽ lưu. Màn sửa xe vẫn đổi
   được tên. App Partner và client cũ vẫn gửi tên như trước.
6. **Cà vẹt điền biển số và màu sơn**: bộ đọc thêm trường `color` ("Màu sơn"). Lượt đọc MỚI điền ĐÈ biển
   số + màu vào form (cà vẹt là giấy tờ gốc của chính chiếc xe) và khoá hai ô đó theo điều 4. Luật "chỉ điền
   ô trống" của ADR 0100 điều 2 vẫn áp cho ba ô tên chủ xe, số khung, số máy.

## Hệ quả

- Đăng một chiếc xe có trong dữ liệu chỉ còn: hãng, mẫu xe, năm, biển số (hoặc ảnh cà vẹt). Không còn
  bước "Áp dụng".
- Chất lượng dữ liệu xe chuẩn ảnh hưởng thẳng tới form. Dữ liệu sai sẽ được điền sai, dù chủ xe vẫn sửa
  được từng ô. Admin cần duyệt dữ liệu trước khi gợi ý (đã có ở ADR 0090 điều 4).
- `CatalogSpecSuggestionCard` gỡ khỏi web. App Partner vẫn dùng bản riêng (ADR 0031) và các khoá i18n cũ
  của nó vẫn giữ nguyên.

## Cần xem lại khi

Một hãng vượt 500 xe chuẩn (chuyển ô Mẫu xe sang tìm ở server), hoặc app Partner theo kịp luồng này (khi
đó gỡ các khoá i18n của thẻ "Áp dụng thông số").
