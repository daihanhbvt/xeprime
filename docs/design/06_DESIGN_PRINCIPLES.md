# 06 — Design Principles

> Ngày: 04/08/2026 · Chủ sở hữu: Creative Director
> Tám nguyên tắc. Mỗi nguyên tắc có **phép thử** — thứ dùng để phân xử khi hai thiết kế đều "trông ổn".
> Nguyên tắc chỉ có giá trị khi nó **loại bỏ được một lựa chọn hấp dẫn**. Nếu một nguyên tắc không bao giờ khiến ai phải bỏ đi thứ họ thích, nó là khẩu hiệu, không phải nguyên tắc.

---

## 1. Câu trả lời trước, công cụ sau

Người dùng mở màn hình vì có một câu hỏi. Màn hình phải trả lời câu hỏi đó ở dòng đầu tiên, trước khi đưa ra bộ lọc, tab hay bảng.

**Nghĩa là**: `/manage` mở ra là "Hôm nay giao 3 xe, nhận 2 xe, 4 đơn quá hạn thu" — không phải một dãy thẻ số liệu tháng. Trang công nợ mở ra là "37.025.000 đ từ 16 đơn, 14 đơn quá hạn".

**Không có nghĩa là** nhét thật nhiều KPI lên đầu. Một câu trả lời, không phải sáu.

> **Phép thử**: che phần dưới màn hình. Người dùng có biết phải làm gì tiếp theo không?

---

## 2. Một sự thật, hiện một lần

Mỗi con số chỉ có một nguồn và một cách hiển thị trong toàn sản phẩm. "Còn nợ" ở bảng đơn, ở drawer chi tiết, ở màn công nợ và trong hợp đồng phải là **cùng một phép tính, cùng một định dạng**.

**Nghĩa là**: `bookingDebt()` (`apps/api/src/common/money.ts`) là định nghĩa duy nhất của công nợ; `formatMoneyVnd` là cách hiển thị duy nhất của tiền; `StatusTag` đọc nhãn/màu từ `@xeprime/types`. Thiết kế không được đặt ra cách trình bày riêng cho một màn.

**Không có nghĩa là** không được có góc nhìn khác nhau. Được — nhưng cùng một con số.

> **Phép thử**: mở hai màn cùng chứa giá trị đó. Có khác nhau một chữ nào không?

---

## 3. Không màn hình nào là ngõ cụt

Mọi bề mặt phải xử lý được **cả năm** trạng thái: đang tải · có dữ liệu · rỗng · lỗi · không đủ quyền. Trạng thái rỗng phải dạy việc; trạng thái lỗi phải nói bước tiếp theo; trạng thái thiếu quyền phải nói ai cấp được quyền đó.

**Nghĩa là**: "Không có dữ liệu" là văn bản bị cấm. Thay bằng: *"Chưa có đơn thuê nào. Tạo đơn đầu tiên, hoặc chờ yêu cầu từ marketplace."* kèm nút.

**Không có nghĩa là** viết dài. Một câu + một hành động.

> **Phép thử**: bật máy chủ trả 500 và bật tài khoản `shop_viewer`. Màn hình có còn dùng được và tự giải thích không?

---

## 4. Tiền không được mơ hồ

Mỗi con số tiền phải truy được về nguồn sinh ra nó, hiển thị đủ đơn vị, thẳng cột, và không bao giờ đổi cách làm tròn giữa các màn.

**Nghĩa là**: tiền là `Decimal` ở backend, **string** trong JSON (ADR 0007) — thiết kế không được giả định phép tính ở client. Cột tiền canh phải, `tabular-nums`. Số 0 hiển thị `0 đ`, không phải ô trống. "Còn nợ" luôn kèm cách nó ra: `Tổng 5.600.000 − Đã trả 0`.

**Không có nghĩa là** phủ số tiền bằng màu. Đỏ dành cho *quá hạn*, không dành cho *mọi khoản còn nợ*.

> **Phép thử**: chỉ vào một số tiền bất kỳ và hỏi "cái này từ đâu ra?". Có bấm được để thấy nguồn không?

---

## 5. Niềm tin được chứng minh, không được tuyên bố

Trên marketplace, mỗi yếu tố giao diện phải làm tăng khả năng khách tin rằng chiếc xe đó **có thật, còn trống thật, giá đó thật**.

**Nghĩa là**: ảnh thật đạt chuẩn (`01` §6) · lịch còn trống hiển thị ngay trên trang chi tiết · bảng giá từng dòng · hồ sơ gian hàng có số xe, số đơn, đánh giá thật · chính sách huỷ/thế chấp là trường có cấu trúc, không phải đoạn văn tự do.

**Không có nghĩa là** gắn huy hiệu "uy tín" hay "5 sao" khi chưa có dữ liệu đỡ lưng.

> **Phép thử**: bỏ mọi tính từ khỏi trang. Khách còn đủ căn cứ để quyết định không?

---

## 6. Quyền hạn là nội dung, không phải bộ lọc hiển thị

Vai trò khác nhau thấy sản phẩm khác nhau — nhưng khác biệt đó phải được **thiết kế**, không phải là kết quả phụ của việc ẩn nút.

**Nghĩa là**: hành động không có quyền thì **ẩn** khỏi khu vực chính (đỡ nhiễu), nhưng khi người dùng đi thẳng tới nơi đó thì phải gặp **403 có giải thích + chỉ ra ai cấp quyền được**, không phải màn trắng và tuyệt đối không phải màn onboarding gian hàng (bài học 04/08). Backend guard là nguồn bảo vệ; UI chỉ phản ánh.

**Không có nghĩa là** disable nút và im lặng. Nút xám không lý do là câu hỏi gửi cho bộ phận hỗ trợ.

> **Phép thử**: đăng nhập bằng `shop_viewer` và đi hết một luồng. Có chỗ nào bị bí mà không hiểu vì sao không?

---

## 7. Giao diện không hứa cái hệ thống không bảo đảm

Những gì database bảo đảm thì UI được phép khẳng định. Những gì không, UI chỉ được nói ở mức "xem trước".

**Nghĩa là**: chống trùng lịch nằm ở `EXCLUDE USING gist` (ADR 0006) ⇒ `POST /calendar/check-conflict` chỉ là **xem trước cho UX**, và giao diện phải chịu được việc máy chủ từ chối ở bước cuối bằng một thông báo tử tế, chứ không phải "đã kiểm tra rồi mà". Cũng vì vậy: **không optimistic update** cho đặt lịch, thu tiền, duyệt hồ sơ.

**Không có nghĩa là** bỏ kiểm tra sớm. Kiểm tra sớm là lịch sự; ràng buộc là sự thật.

> **Phép thử**: hai người cùng đặt một xe một khung giờ. Người thua có nhận được câu giải thích đúng không?

---

## 8. Không ai bị ép trở thành người khác

Sản phẩm có ba loại người dùng. Mỗi người phải đi hết được việc của mình mà không bị đẩy sang vai trò khác.

**Nghĩa là**: khách thuê không có gian hàng là **trạng thái hợp lệ vĩnh viễn** — không bị đưa vào form tạo gian hàng, không bị coi là hồ sơ chưa hoàn thiện. Chủ shop không bị bắt học khái niệm của nền tảng. Nhân sự nền tảng không có gian hàng vẫn vào được khu quản trị.

**Không có nghĩa là** giấu cơ hội. "Trở thành chủ xe" là một lời mời tự nguyện, đặt đúng chỗ, không phải một bức tường.

> **Phép thử**: tạo tài khoản mới và chỉ làm việc của khách thuê trong 10 phút. Có bị chặn hay bị hỏi về gian hàng lần nào không?

---

## Khi các nguyên tắc mâu thuẫn

Xảy ra thường xuyên. Thứ tự phân xử:

```
An toàn dữ liệu & quyền (6, 7)
        ↓ thắng
Chính xác của thông tin (2, 4)
        ↓ thắng
Hoàn thành được việc (1, 3, 8)
        ↓ thắng
Vẻ đẹp (0)
```

Ví dụ thực tế: hiển thị đầy đủ SĐT khách trong bảng thì tra cứu nhanh hơn (nguyên tắc 1), nhưng vi phạm quyền/PII (nguyên tắc 6). ⇒ Che mặc định, có nút bỏ che, mỗi lần bỏ che ghi audit. Đúng như `MaskedContact` đang làm.

---

## Những gì KHÔNG phải nguyên tắc ở đây

- "Tối giản" — mật độ cao là đúng ở màn vận hành.
- "Nhất quán" — nhất quán là hệ quả của việc dùng chung token/component, không phải mục tiêu tự thân; marketplace và portal *nên* khác nhịp.
- "Đẹp" — không đo được, không phân xử được. Thay bằng: rõ, nhanh, đáng tin.

Liên quan: `08_UX_GUIDELINES.md` (nguyên tắc → mẫu cụ thể) · `04_CREATIVE_BRIEF.md` §11 (tiêu chí duyệt).
