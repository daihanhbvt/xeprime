# ADR 0027 — Hai bậc năng lực: chủ xe dùng bộ cơ bản, gian hàng mở toàn bộ quản lý

Ngày: 29/08/2026 · Trạng thái: Accepted · **Cụ thể hoá [ADR 0014](0014-owner-and-shop-single-role.md) điều 3 · được [ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md) làm rõ bằng Owner Lite dùng chung source với Manage**

## Bối cảnh

[ADR 0020](0020-two-revenue-tracks-one-marketplace.md) đến [ADR 0026](0026-first-trips-free-then-commission.md)
mô tả hai tuyến **chỉ khác nhau ở tiền**: chưa mua gói thì trả 10–15% mỗi chuyến, mua gói thì trả
cước cố định. Nhìn như vậy thì việc nâng cấp là một bài toán số học thuần: xe chạy quá ~1,3
ngày/tháng là nên mua gói.

Nhưng đó mới là một nửa. Khác biệt thật còn nằm ở **bộ tính năng**, và đó mới là thứ khiến gói
đáng mua **kể cả với người chỉ có một chiếc xe**:

- **Chủ xe** cần đúng bốn việc: đăng xe, xem lịch, nhận yêu cầu thuê, giao và nhận lại xe. Đưa
  cho họ sổ thu chi, sổ công nợ và lịch bảo dưỡng là đưa một bảng điều khiển máy bay cho người
  đi xe máy — họ không dùng, và sự phức tạp đó làm họ bỏ đi trước khi kịp có khách đầu tiên.
- **Gian hàng** sống bằng chính những màn đó. Vài chục xe, vài nhân viên, nhiều chi nhánh: không
  có sổ thu chi và công nợ thì không vận hành được.

[ADR 0014 điều 3](0014-owner-and-shop-single-role.md) đã chốt nguyên tắc — *"`plans` quyết định
NĂNG LỰC"* — nhưng chưa ai viết ra **năng lực nào**. Thiếu danh sách đó thì mỗi màn mới lại tự
quyết định lấy, và sáu tháng sau không ai trả lời được "gian hàng trả tiền để được thêm cái gì".

## Quyết định

1. **Hai bậc năng lực, ranh giới là một danh sách tường minh.**

   | Chủ xe — bộ cơ bản | Gian hàng — mở thêm |
   | --- | --- |
   | Xe, giấy tờ xe, đưa xe lên chợ | **Thu chi** (phiếu thu, phiếu chi, sổ quỹ) |
   | Lịch xe, chặn lịch | **Công nợ** |
   | Yêu cầu thuê, duyệt / từ chối | **Báo cáo** (theo xe, theo khách, theo kỳ) |
   | Đơn thuê, giao và nhận lại xe | **Bảo dưỡng** và chi phí bảo dưỡng |
   | Sổ khách hàng, đánh giá | **Nhân viên** và phân quyền |
   | Chat, hồ sơ gian hàng | **Chi nhánh** |
   | | **Tài xế** |
   | | **Hợp đồng** |

   Chủ xe vẫn thấy **số tiền của từng đơn** — nó nằm sẵn trên đơn thuê. Cái họ không có là **sổ
   tổng hợp**: cộng dồn theo kỳ, theo xe, theo khách, và đối chiếu công nợ. Ranh giới này cố ý
   ghi ra để không ai vô tình dựng một bản báo cáo thu gọn vào bậc cơ bản rồi làm gói mất một
   phần lý do tồn tại.

2. **Đây là TRỤC THỨ HAI, độc lập với quyền theo vai.** Hai câu hỏi khác nhau, và gộp chúng là
   một nguồn lỗi:

   ```
   Gian hàng này CÓ tính năng thu chi không?   →  gói hiện hành      (ADR 0027)
   Người này ĐƯỢC xem thu chi không?           →  vai + permission   (ADR 0002)
   ```

   **Cả hai phải cùng đạt.** Một `shop_manager` trong gian hàng chưa mua gói vẫn không vào được
   sổ thu chi; một `shop_staff` trong gian hàng đã mua gói vẫn bị chặn nếu vai của họ không có
   `finance.view`. Không được nhét cờ tính năng vào bảng permission, cũng không được suy quyền
   từ gói — hai bảng, hai câu trả lời, kiểm tra nối tiếp nhau.

3. **Ba trạng thái của một tính năng, không phải hai.**

   | Trạng thái | Khi nào | Người dùng thấy gì |
   | --- | --- | --- |
   | `enabled` | Gói hiện hành có cờ | Dùng bình thường |
   | `read_only` | Không có cờ, **nhưng tenant đã có dữ liệu** từ kỳ trước | Menu còn, xem lại được hết, nút thêm/sửa bị khoá, có băng báo hết hạn kèm nút gia hạn |
   | `hidden` | Không có cờ và **chưa bao giờ có dữ liệu** | Không thấy menu |

   Trạng thái giữa là điều quan trọng nhất của ADR này. **Không ai được mất quyền xem sổ sách của
   chính mình vì hết hạn gói.** Ẩn hẳn menu thì dữ liệu vẫn còn nhưng người dùng tin là đã mất, và
   việc đầu tiên họ làm là gọi hỗ trợ chứ không phải gia hạn. Băng báo hết hạn ngay trên màn sổ
   thu chi cũng là lời nhắc gia hạn đúng chỗ nhất mà nền tảng có.

   Trạng thái `hidden` giữ cho chủ xe mới không phải nhìn năm cái menu khoá — sản phẩm của họ
   trông gọn, không trông cụt.

4. **Chặn ở SERVER là chính, ẩn menu chỉ là trang trí.** Mọi endpoint thuộc nhóm nâng cao phải
   qua một guard đọc cờ tính năng từ gói hiện hành, **cùng kỷ luật** [ADR 0002](0002-auth-session-cookie.md)
   đặt cho permission. Ẩn nút mà không chặn API là để ngỏ cho bất kỳ ai gọi thẳng endpoint.

   Guard đọc **cờ trên `plans.limits_json.features`** — [ADR 0015 điều 4](0015-vehicle-slot-billing.md)
   đã chừa sẵn chỗ này. Danh sách cờ là **dữ liệu admin sửa được**; việc *phải có một cổng chặn ở
   server* là **quy tắc trong code**.

5. **Cờ đọc từ gói HIỆN HÀNH, không đóng băng vào đơn.**

   Đây là chỗ ADR này **khác** [ADR 0024](0024-billing-mode-from-plan-frozen-on-booking.md), và
   sự khác biệt có lý do: chế độ thu phí phải đóng băng vì nó quyết định **một số tiền đã thoả
   thuận với khách**. Năng lực thì không — nó là quyền dùng phần mềm *ngay lúc này*. Gia hạn gói
   xong thì sổ thu chi mở lại ngay, không phải chờ chuyến mới.

6. **Ưu đãi hai chuyến đầu ([ADR 0026](0026-first-trips-free-then-commission.md)) KHÔNG mở tính
   năng nâng cao.** Nó miễn *phí*, không nâng *bậc*. Trộn hai thứ lại thì tenant mới được dùng
   thử toàn bộ rồi bị lấy đi — cách chắc chắn nhất để biến một ưu đãi thành một trải nghiệm tệ.

## Hệ quả về giá trên chợ — và điều nền tảng KHÔNG được làm

Chủ xe tuyến hoa hồng mất 10–15% mỗi chuyến, nên hành vi tự nhiên của họ là **nâng giá niêm yết
lên một chút để bù**. Xe của gian hàng không chịu phí trên chuyến nên không cần bù.

Hệ quả: **cùng một dòng xe, xe gian hàng thường rẻ hơn trên chợ.** Chợ mặc định cho sắp xếp theo
giá ⇒ xe gian hàng lên trước ⇒ có nhiều đơn hơn ⇒ thêm một lý do nâng cấp mà nền tảng không phải
làm gì cả.

Điều này **không mâu thuẫn** [ADR 0020 điều 2](0020-two-revenue-tracks-one-marketplace.md).
Điều 2 cấm **nền tảng** cộng phí lên giá khách; nó không nói gì về việc chủ xe tự định giá xe của
mình — đó là quyền của họ ([ADR 0014 điều 5](0014-owner-and-shop-single-role.md): nền tảng không
đứng giữa chuyện giá).

Hai việc **cấm**, vì cả hai đều là cách phá cơ chế tự nhiên ở trên:

- **Không đẩy hạng tìm kiếm theo tuyến.** Không boost xe hoa hồng vì nó sinh doanh thu, cũng
  không boost xe gian hàng vì họ trả tiền trước. Xếp hạng theo thứ khách quan tâm; chênh lệch giá
  tự nó làm phần còn lại.
- **Không "san bằng" chênh lệch giá.** Không hiển thị giá đã trừ phí, không gợi ý chủ xe nên
  niêm yết bao nhiêu để ngang bằng. Chênh lệch đó **là** tín hiệu, xoá nó đi là xoá luôn động lực
  nâng cấp.

## Ràng buộc bắt buộc

1. **`tenants.tenant_type` vẫn không được hỏi tới** ([ADR 0014 điều 2](0014-owner-and-shop-single-role.md)).
   Nhãn hiển thị, không phải nguồn năng lực. Menu đọc cờ tính năng, không đọc nhãn.
2. **Không có bậc "cơ bản" nào trong `roles`.** Chủ xe và chủ gian hàng cùng vai `shop_owner`,
   cùng bộ permission. Khác nhau ở gói, đúng như [ADR 0014](0014-owner-and-shop-single-role.md)
   điều 1 và 4 đã chốt: nâng cấp là **mua gói khác**, không đổi vai, không tạo lại tenant.
3. **Một cờ tính năng gác cả một NHÓM endpoint**, không phải từng endpoint một. Cắt nhỏ quá thì
   sinh trạng thái nửa vời — xem được phiếu thu nhưng không xem được sổ quỹ — mà không ai giải
   thích nổi.
4. **Trạng thái `read_only` phải chặn ở server**, không chỉ ẩn nút. Và nó chỉ chặn **ghi**: mọi
   endpoint `*.view` của nhóm đó vẫn phải trả dữ liệu bình thường.

## Hoãn có chủ đích

- **Nhiều hơn hai bậc** (ví dụ gian hàng cơ bản / gian hàng nâng cao). Cấu trúc cờ đã cho phép,
  nhưng chưa có dữ liệu để chọn ranh giới thứ hai. Thêm bậc sớm là nhân đôi số tổ hợp phải test.
- **Dùng thử tính năng nâng cao có hạn ngày.** Khác với điều 6 ở chỗ nó là một ưu đãi riêng, có
  chủ ý — làm được sau, nhưng phải thiết kế đường hạ cánh trước, và đường hạ cánh chính là trạng
  thái `read_only` ở điều 3.
- **Xuất dữ liệu khi hết hạn.** Trạng thái `read_only` đã giải phần lớn nhu cầu; xuất file là
  việc riêng, chưa gấp.

## Hệ quả

- `plans.limits_json.features` có danh sách cờ chốt; seed các bậc gói phải khai đúng.
- Một guard mới ở `apps/api` cho nhóm endpoint nâng cao, đứng **cạnh** guard permission chứ không
  thay nó.
- `apps/web` cần một hook trả về ba trạng thái ở điều 3 để menu và băng báo dùng chung một nguồn.
- Màn "Gói của tôi" phải liệt kê **được thêm gì khi nâng cấp** — đây là chỗ bán hàng thật sự, và
  nó chỉ thuyết phục khi danh sách ở điều 1 được viết bằng ngôn ngữ người dùng, không phải tên
  module.
- Tenant hiện có được backfill gói ([ADR 0015 điều 9](0015-vehicle-slot-billing.md)) phải rơi vào
  bậc **có đủ tính năng đang dùng**, nếu không một lần deploy sẽ khoá sổ thu chi của những người
  đang dùng thật.

## Cần xem lại khi nào

Khi tỉ lệ nâng cấp lệch hẳn về lý do tính năng chứ không phải lý do chi phí (hoặc ngược lại) —
lúc đó ranh giới ở điều 1 đang đặt sai chỗ. Hoặc khi có nhóm khách hàng cần một bậc ở giữa.
