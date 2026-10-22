# BRD — Luồng khách hàng: Xe yêu thích

- **Ngày:** 21/10/2026
- **Trạng thái:** Bản nghiệp vụ chờ duyệt
- **Mục tiêu:** Mô tả nhu cầu và luồng khách hàng để chủ sản phẩm duyệt trước khi thiết kế/triển khai.

## 1. Bối cảnh

XePrime hiện chưa có tính năng Xe yêu thích hoạt động. Khách chưa thể lưu xe để quay lại xem; trang `/account/favorites` hiện là trang giữ chỗ. Ảnh Mioto tham khảo có danh sách yêu thích với thông tin xe, giá, thao tác bỏ thích và xem chi tiết. XePrime có thêm cả ô tô, xe máy, tự lái, có tài xế và thuê dài hạn.

## 2. Mục tiêu khách hàng

Khách hàng muốn lưu một xe đang quan tâm, tìm lại xe đó trong tài khoản và tiếp tục xem thông tin/đặt xe khi sẵn sàng. Tính năng không tự tạo yêu cầu đặt xe và không giữ giá hay tình trạng còn xe.

## 3. Cấu trúc danh sách đề xuất

Trang **Xe yêu thích** chia thành hai tab loại phương tiện:

- **Ô tô**
- **Xe máy**

Mỗi xe được lưu một lần và xuất hiện trong tab tương ứng với loại xe. Trên từng thẻ hiển thị các tag dịch vụ mà xe hiện đang cung cấp, ví dụ:

- **Tự lái**
- **Có tài xế**
- **Thuê dài hạn**

Các tag thể hiện dịch vụ/khả năng thuê hiện có của xe, không phải trạng thái đặt xe. Một xe có thể có nhiều tag cùng lúc. Nếu dịch vụ bị chủ xe tắt hoặc xe không còn được niêm yết, tag/danh sách phản ánh dữ liệu hiện tại.

> Cần chốt phạm vi tag ở XePrime: hiện `serviceTypes` có tự lái, có tài xế và thuê dài hạn; tag “Xe máy/Ô tô” đã được thể hiện bằng tab nên không lặp lại trên thẻ. “Đặt ngay”, “Miễn thế chấp”, “Giao xe tận nơi” là tiện ích/điều kiện khác, chỉ thêm nếu muốn hiển thị trong danh sách yêu thích.

## 4. Thông tin và thao tác trên thẻ

Mỗi thẻ yêu thích cần giúp khách nhận diện và quyết định có tiếp tục xem xe không:

- Ảnh đại diện và tên xe.
- Các tag dịch vụ hiện hành.
- Thông tin ngắn: số chỗ (nếu có), hộp số/nhiên liệu phù hợp, địa điểm nhận xe, đánh giá/lượt thuê nếu có.
- Giá hiện hành phù hợp với dịch vụ đang được hiển thị. Có thể có nhiều giá khi xe cung cấp nhiều dịch vụ; không đóng băng giá tại thời điểm khách bấm thích.
- **Bỏ thích**.
- **Xem chi tiết**.

BRD chưa chốt bố cục, kích thước hay phong cách UI.

## 5. Luồng khách hàng

### 5.1 Lưu xe từ danh sách hoặc trang chi tiết

1. Khách duyệt kết quả tìm kiếm hoặc trang chi tiết xe.
2. Khách bấm biểu tượng yêu thích trên xe.
3. Giao diện cập nhật trạng thái trái tim ngay lập tức theo thao tác của khách (optimistic update), không chờ API phản hồi.
4. Đồng thời, giao diện gọi API ở nền để lưu xe vào danh sách yêu thích của tài khoản.
5. Nếu API thành công, giữ nguyên trạng thái vừa cập nhật.
6. Nếu API thất bại do mất mạng, hết phiên hoặc lỗi máy chủ, hoàn tác trạng thái giao diện về đúng trạng thái trước thao tác và thông báo ngắn gọn để khách biết thao tác chưa được lưu.
7. Nếu chưa đăng nhập, hệ thống yêu cầu đăng nhập/đăng ký theo luồng hiện có, rồi quay lại đúng ngữ cảnh để hoàn tất thao tác lưu.

### 5.2 Xem xe đã thích

1. Khách vào **Tài khoản → Xe yêu thích**.
2. Hệ thống mở tab **Ô tô** mặc định (cần chủ sản phẩm duyệt; có thể nhớ tab gần nhất thay vì mặc định).
3. Khách chuyển giữa tab **Ô tô** và **Xe máy**.
4. Mỗi tab chỉ liệt kê loại xe tương ứng; tag trên thẻ cho biết dịch vụ xe đang cung cấp.
5. Khách chọn **Xem chi tiết** để tiếp tục xem/đặt xe. Trang chi tiết mở với dịch vụ phù hợp nếu khách chọn một tag cụ thể; nếu không, dùng dịch vụ mặc định của trang chi tiết.

### 5.3 Bỏ thích

1. Khách chọn **Bỏ thích** trên thẻ.
2. Giao diện bỏ thẻ khỏi danh sách ngay lập tức và cập nhật trạng thái trái tim tương ứng ở các nơi khác; đồng thời gọi API ở nền để xóa yêu thích.
3. Nếu API thành công, giữ nguyên cập nhật.
4. Nếu API thất bại, khôi phục thẻ và trạng thái trái tim về trạng thái trước thao tác, rồi thông báo thao tác chưa được lưu.
5. Nếu xe có nhiều tag dịch vụ thì bỏ thích vẫn bỏ toàn bộ xe, không chỉ một tag.

### 5.4 Danh sách rỗng hoặc xe không còn khả dụng

- Tab chưa có xe yêu thích: thông báo danh sách trống và đường dẫn quay lại tìm xe.
- Xe tạm ẩn/gỡ khỏi chợ/đình chỉ/không còn dịch vụ: không hiện xe đó trong danh sách có thể thao tác; không tự xóa lượt yêu thích. Nếu xe được mở bán lại và vẫn phù hợp, xe có thể xuất hiện lại.
- Xe bị xóa vĩnh viễn: mục yêu thích không còn khả năng mở chi tiết; dữ liệu được dọn theo chính sách lưu trữ tài khoản/xe của XePrime.
- Xe đã thích nhưng hết chỗ trong ngày khách muốn thuê: vẫn có thể mở trang chi tiết; lịch còn chỗ được kiểm tra ở luồng đặt xe, không phải trạng thái yêu thích.

## 6. Quy tắc nghiệp vụ

1. Danh sách yêu thích gắn với tài khoản khách hàng đã đăng nhập; người khác không xem/sửa danh sách.
2. Cùng một khách chỉ có một mục yêu thích cho một xe, dù xe có nhiều dịch vụ.
3. Loại xe quyết định tab; dịch vụ quyết định các tag được hiển thị trên thẻ.
4. Tag phản ánh cấu hình dịch vụ hiện hành của xe, không phải dịch vụ khách đã đặt.
5. Giá, ảnh, đánh giá và trạng thái niêm yết lấy dữ liệu mới nhất khi tải danh sách.
6. Yêu thích không phải đặt chỗ, không khóa lịch, không giữ giá, không gửi thông báo cho chủ xe và không thay đổi thứ tự/xếp hạng trên Marketplace.
7. Chuyển tab không thêm/bỏ thích. Bỏ thích ở bất kỳ tab/thẻ nào xóa xe khỏi danh sách hoàn toàn.
8. Thao tác thêm/bỏ thích dùng optimistic update: UI đổi ngay, API chạy nền; khi API lỗi thì rollback UI về trạng thái trước thao tác và báo cho khách. Kết quả lỗi không được để UI tiếp tục thể hiện như thể đã lưu thành công.

## 7. Trường hợp ngoại lệ cần xử lý

- Người dùng chưa đăng nhập hoặc phiên hết hạn khi lưu/xem danh sách.
- Bấm lưu/bỏ thích nhiều lần hoặc kết nối lỗi giữa chừng.
- API thêm/bỏ thích thất bại sau khi UI đã cập nhật lạc quan; cần rollback đúng mục và trạng thái tim, không ảnh hưởng thao tác yêu thích của xe khác.
- Xe thay đổi dịch vụ từ tự lái sang có tài xế, hoặc ngược lại.
- Xe đổi loại, bị gỡ/ẩn khỏi Marketplace hoặc bị xóa.
- Xe có nhiều dịch vụ với mức giá khác nhau.
- Danh sách dài cần tải thêm; lỗi tải và thử lại.

## 8. Tiêu chí chấp nhận nghiệp vụ

- Khách có thể lưu xe từ danh sách và chi tiết, đăng nhập xong vẫn hoàn tất đúng ý định.
- Danh sách phân loại đúng Ô tô/Xe máy.
- Thẻ hiển thị các tag dịch vụ đang áp dụng; xe nhiều dịch vụ có nhiều tag.
- Bỏ thích loại xe khỏi danh sách và đồng bộ trạng thái trên Marketplace.
- Thao tác phản hồi ngay trên giao diện; nếu API thất bại, giao diện hoàn tác về dữ liệu trước đó và báo lỗi cho khách.
- Thông tin thẻ phản ánh dữ liệu mới nhất; xe không còn khả dụng không bị nhầm là có thể đặt ngay.
- Khách hiểu rõ yêu thích chỉ để lưu xe, không giữ giá/lịch và không phải yêu cầu đặt xe.

## 9. Câu hỏi cần duyệt

1. **Hai tab Ô tô/Xe máy và tag dịch vụ**: xác nhận đây là cấu trúc cần triển khai?
2. **Thuê dài hạn**: xác nhận hiển thị cùng dạng tag dịch vụ trên thẻ với Tự lái/Có tài xế? XePrime hiện có dịch vụ dài hạn, nhưng ảnh Mioto không thể hiện tab riêng cho dài hạn.
3. **Tag tiện ích**: danh sách yêu thích chỉ hiện tag dịch vụ, hay thêm “Đặt ngay”, “Giao xe tận nơi”, “Miễn thế chấp”?
4. **Xe có nhiều dịch vụ**: khi bấm “Xem chi tiết”, mở trang chung hay tự chọn một dịch vụ làm mặc định?
5. **Tab mặc định**: luôn mở Ô tô hay nhớ tab khách đã chọn lần trước?

## 10. Đối chiếu hiện trạng XePrime

- `apps/web/src/app/(public)/account/favorites/page.tsx`: trang giữ chỗ, chưa có danh sách.
- `apps/web/src/features/marketplace/components/VehicleCard.tsx`: trái tim hiện chỉ đổi state cục bộ.
- `docs/design/03_PRODUCT_GAP_ANALYSIS.md`: favorites được liệt kê là mục tài khoản chưa triển khai.
- XePrime đã có loại phương tiện và các dịch vụ trên hồ sơ/niêm yết xe; cần xác nhận tag hiển thị theo trường dịch vụ nào khi làm đặc tả chi tiết.
