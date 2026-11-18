# ADR 0099 - Cà vẹt bắt buộc khi thêm xe cho CẢ ô tô và xe máy, ở cả hai luồng thêm xe

Ngày: 17/11/2026 · Trạng thái: **Accepted** (17/11/2026 - người dùng chốt: xe máy bắt buộc như ô tô; ảnh
vẫn bắt buộc, nhập tay chỉ để sửa/bổ sung kết quả đọc; áp cho luồng nâng cao + luồng đăng nhanh, web + app
Partner) · Mở rộng: [0089](0089-vehicle-registration-at-car-create.md) (ghi đè điều 1 trong phạm vi "chỉ ô
tô" và "chỉ wizard nâng cao trên web")

## Bối cảnh

ADR 0089 chỉ hỏi cà vẹt khi tạo Ô TÔ ở wizard nâng cao trên web, vì lúc đó cà vẹt chỉ phục vụ bảo hiểm MIC
(xe máy chưa có bảo hiểm). Đợt thiết kế lại màn "Thêm xe mới" (Figma `24352:70390`) đặt ô "Cà vẹt xe" là
góc ảnh thứ sáu của thẻ "Ảnh xe" và hai ô "Số khung" / "Số máy" ngay trong "Thông tin xe" - cho mọi xe. Chủ
sản phẩm muốn mọi xe lên sàn đều có giấy đăng ký đối chiếu được, không riêng ô tô, và muốn chủ xe tuyến hoa
hồng (luồng đăng nhanh) cũng đi qua cùng cổng đó.

## Quyết định

1. **Bắt buộc với mọi loại xe khi thêm xe**, ở **cả** wizard nâng cao (`/vehicles/new`) và luồng đăng nhanh
   (`/vehicles/register`), trên web lẫn app Partner. Phiên hỗ trợ vẫn không có ô này (điều 1 của 0089 giữ
   nguyên phần đó).
2. **Cơ chế như bằng lái khách** (ADR 0057/0070): chụp ảnh mặt trước → máy đọc tại chỗ (Tesseract) → đủ tên
   chủ + số khung + số máy và biển khớp ⇒ tự điền, hiện bản tóm tắt; thiếu/không chắc ⇒ mở ô nhập tay.
   **Chủ xe đổi sang "Nhập tay" được bất cứ lúc nào** (không phải chờ máy đọc xong) để sửa/bổ sung - nhưng
   **ảnh vẫn bắt buộc**: nó là bằng chứng đối chiếu cho bảo hiểm và kiểm duyệt.
3. **Server bỏ chặn xe máy**: `POST /vehicles` nhận `registration` với `vehicleType = motorbike`. Bộ đọc nhận
   cả biển xe máy (seri có chữ số, `59X1-123.45`; seri hai chữ `29AA-123.45`); phép so biển trên cà vẹt với
   biển của xe vẫn chuẩn hoá bỏ dấu nên không phụ thuộc cách tách seri.
4. Server **vẫn chưa bắt buộc** trường `registration` (app native bản cũ đang chạy không gửi) - cổng bắt
   buộc ở client như 0089. Khi mọi bản app đã có ô này, chuyển thành bắt buộc ở server bằng một ADR sau.

## Hệ quả

- Xe máy giờ có giấy tờ `registration` ngay khi tạo; tab Giấy tờ của xe máy không còn nhắc thiếu cà vẹt
  với xe mới.
- Luồng đăng nhanh dài thêm một ô ảnh; bù lại số khung/số máy tự điền từ ảnh.
- Xe cũ không bị chặn (giữ điều của 0089: chỉ nhắc ở tab Giấy tờ).
