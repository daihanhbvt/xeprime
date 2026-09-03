# 04 — Creative Brief

> Ngày: 04/08/2026 · Cập nhật phạm vi: 03/09/2026 · Chủ sở hữu: Creative Director
> Đây là bản brief giao việc cho thiết kế. Đọc `01_BRAND_GUIDE.md` và `02_PRODUCT_VISION.md` trước.

---

## 1. Đề bài

Thiết kế trải nghiệm XePrime để nó **được nhận ra là sản phẩm hạng nhất trong ngành cho thuê xe Việt Nam** — kết nối một marketplace đáng tin với hai bề mặt vận hành: Owner Lite và Full Manage.

Đây không phải một dự án "làm đẹp giao diện". Sản phẩm đã đúng về nghiệp vụ. Việc cần làm là nâng nó từ *đúng* lên *đáng tin và dùng sướng*, và điều đó chủ yếu được quyết định bởi những thứ không phải màu sắc: thứ bậc thông tin, tốc độ, cách hệ thống nói khi có chuyện.

---

## 2. Bối cảnh

| Đang có | Ý nghĩa với thiết kế |
| --- | --- |
| Nghiệp vụ web đủ để một gian hàng thử bỏ Excel | Không được phá luồng; thiết kế lại *bề mặt*, giữ *xương* |
| Hai bản sắc thị giác song song (portal cũ dark, bản mới light) | Phải chốt một hệ và chuyển dứt điểm |
| Marketplace đang có thẻ xe dùng ảnh sai | Chất lượng nội dung là bài toán thiết kế, không chỉ là bài toán kiểm duyệt |
| Chủ xe vận hành nhiều trên điện thoại | Responsive web là mặt trận chính của Owner/Manage; native ưu tiên khách thuê |
| Ràng buộc kỹ thuật cứng (AntD 6, CSS Modules, token) | Thiết kế phải nằm trong hệ đó — xem `10` |

---

## 3. Người xem

| Ai | Ở đâu, lúc nào | Trạng thái tinh thần | Điều họ cần từ thiết kế |
| --- | --- | --- | --- |
| Chủ xe cơ bản | Bên cạnh xe, điện thoại, một tay | Muốn đăng xe và xử lý chuyến, không muốn học ERP | Ít menu, biết tiền thực nhận, hoàn thành một chuyến từ đầu đến cuối |
| Chủ shop | Ngoài bãi xe, điện thoại hoặc quầy | Bận, bị gọi liên tục | Trả lời được câu hỏi trong 5 giây, chạm to, ít bước |
| Nhân viên | Quầy, laptop, cả ngày | Lặp lại, muốn nhanh | Mật độ cao, phím tắt, không phải chờ |
| Khách thuê | Điện thoại, tối thứ Năm | So sánh 4 nơi, dễ bỏ đi | Ảnh thật, giá cuối, còn trống thật, ít bước |
| Nền tảng | Desktop, giờ hành chính | Xử lý hàng loạt, cần chính xác | Danh sách mạnh, filter, bằng chứng, dấu vết |

---

## 4. Insight

> Trong ngành này, **niềm tin không được tuyên bố — nó được chứng minh bằng độ chính xác của thông tin nhỏ**.

Khách không tin vì thấy chữ "uy tín"; họ tin vì đúng chiếc xe trong ảnh, đúng cái giá cuối cùng, đúng khung giờ còn trống. Chủ shop không tin phần mềm vì màn hình đẹp; họ tin vì tháng này con số khớp với tiền trong ví.

⇒ **Mọi ngân sách thiết kế nên đổ vào chỗ thông tin được trình bày, không phải chỗ trang trí.**

---

## 5. Ý tưởng lớn

> ### "Bảng điều khiển của một tài sản đang chạy."

XePrime nên có cảm giác của **buồng lái**, không phải của tờ rơi. Mỗi màn hình trả lời đúng một câu hỏi vận hành, và trả lời ngay ở dòng đầu tiên. Gold không dùng để làm sang — nó dùng để **chỉ chỗ cần nhìn**.

Ba hệ quả trực tiếp:

1. **Câu trả lời trước, chi tiết sau.** Đầu mỗi màn là câu trả lời ("Hôm nay: giao 3, nhận 2, 4 đơn quá hạn thu"), không phải bộ lọc.
2. **Màu là thông tin.** Trên một màn hình chỉ được có một điểm gold. Nếu có ba, không cái nào còn nghĩa.
3. **Yên tĩnh khi mọi thứ ổn.** Giao diện chỉ lên tiếng khi có việc cần người xử lý.

---

## 6. Tông thiết kế

| Là | Không phải |
| --- | --- |
| Điềm tĩnh, chắc chắn | Buồn tẻ, vô hồn |
| Sang trọng có kiềm chế | Phô trương, gradient vàng khắp nơi |
| Dày dữ liệu nhưng có thứ bậc | Chật chội, mọi thứ cùng cỡ |
| Thân thiện đúng chỗ (marketplace) | Cợt nhả, emoji trong màn tiền |
| Nghiêm túc đúng chỗ (portal) | Lạnh lùng, thuật ngữ kỹ thuật |

**Hai nhân cách, một thương hiệu**: marketplace ấm và mời gọi (ảnh lớn, khoảng thở, Playfair ở hero); portal điềm tĩnh và hiệu quả (mật độ cao, gold tiết chế, không có font trang trí). Cùng token, cùng giọng, khác nhịp.

---

## 7. Tham chiếu — lấy gì, không lấy gì

| Sản phẩm | Lấy | **Không** lấy |
| --- | --- | --- |
| **Linear** | Tốc độ cảm nhận, ⌘K, phím tắt, danh sách dày mà vẫn đọc được, trạng thái là chip nhỏ | Thẩm mỹ dark tối giản dành cho kỹ sư; người dùng ta không phải dev |
| **Stripe** | Trình bày tiền và số liệu ở đẳng cấp cao nhất; thông báo lỗi nói rõ chuyện gì và làm gì tiếp; bảng có thứ bậc | Mức trừu tượng của tài liệu API; giao diện dành cho người biết đọc log |
| **Notion** | Bề mặt yên tĩnh, khoảng trắng có chủ đích, trạng thái rỗng dạy việc | Tự do bố cục — nghiệp vụ của ta cần bố cục cố định, đoán trước được |
| **Atlassian** | IA cho nhiều vai trò, mẫu quyền hạn, chuẩn a11y, hệ thống mẫu component chặt | Độ phức tạp cấu hình; menu nhiều tầng |
| **Airbnb** | Niềm tin qua ảnh và hồ sơ chủ nhà, minh bạch giá theo từng dòng, lịch còn trống ngay trên trang chi tiết | Cảm giác "du lịch/lifestyle" — ta bán vận hành, không bán giấc mơ |

> Nguyên tắc dùng tham chiếu: **mượn nguyên lý, không mượn hình ảnh.** Không có màn hình nào của XePrime được phép trông như bản sao đổi màu của một sản phẩm khác.

---

## 8. Việc phải làm

### 8.1 Nền tảng hệ thống thiết kế
- Hoàn thiện token: thang màu ngữ nghĩa (`-bg`/`-border`/`-text`), dải màu data-viz, bộ giá trị dark cho portal
- Bộ component chuẩn: nút, input, select, date/time, bảng, chip trạng thái, drawer, modal, bottom sheet, empty, error, skeleton, thẻ xe, ô tiền
- Ba trạng thái bắt buộc vẽ cho **mọi** component: mặc định / đang xử lý / lỗi (+ disabled kèm lý do)

### 8.2 Marketplace
Trang chủ · kết quả tìm + bộ lọc · chi tiết xe (có lịch trống + bảng giá) · trang gian hàng · luồng đặt xe · chuyến của tôi · tài khoản · auth modal

### 8.3 Owner Lite và Portal gian hàng

Owner Lite: tổng quan · xe · lịch · yêu cầu/chuyến · bàn giao/trả · tiền của tôi · chat · nâng cấp.

Full Manage: toàn bộ Owner Lite + khách hàng · tài chính · thu chi · công nợ · báo cáo · bảo trì · hợp đồng · chi nhánh · tài xế · thành viên.

### 8.4 Portal nền tảng

Tổng quan · duyệt/xác minh người bán · gian hàng · xe/đơn/khách toàn hệ thống · gói/hóa đơn · giao dịch ngân hàng · hoàn tiền · số dư/rút tiền · tranh chấp/support · nhân sự · nhật ký.

### 8.5 Chuyển thể mobile

Mọi màn Owner/Manage/Admin phải có responsive web dùng được. App native trước mắt chỉ thiết kế trọn luồng khách thuê: tìm xe → đặt/giữ chỗ → chuyến → chat → thông báo.

---

## 9. Ràng buộc (bản rút gọn — bản đầy đủ ở `10`)

- Ant Design 6 + CSS Modules + token `--xp-*`. Không styled-components, không inline style, không bộ icon thứ hai.
- Không thư viện lịch trả phí. Lịch là component tự dựng (`@tanstack/react-virtual` + `@dnd-kit`).
- Trạng thái/role/nhãn nghiệp vụ lấy từ `@xeprime/types` — thiết kế không được đặt tên trạng thái mới nếu chưa thêm vào đó.
- Tiền là **string** trong JSON (ADR 0007); mọi mockup tiền phải theo định dạng VND thật.
- Giờ hiển thị `Asia/Ho_Chi_Minh`.
- Marketplace phải giữ được render tĩnh cho SEO — thiết kế không được đòi trạng thái client ở tầng layout gốc.

---

## 10. Thế nào là thành công

| Tiêu chí | Đo bằng |
| --- | --- |
| Nhân viên tạo một đơn thuê | ≤ 60 giây, ≤ 2 màn hình |
| Chủ shop biết việc hôm nay | ≤ 5 giây sau khi mở app, không cuộn |
| Khách hoàn tất đặt xe | ≤ 3 phút trên điện thoại, ≥ 55% chuyển đổi từ lúc mở form |
| Mọi màn danh sách | Có đủ loading / rỗng / lỗi / thiếu quyền được vẽ |
| Mọi màn | Bản mobile được vẽ, không suy diễn |
| Tương phản | AA ở mọi trạng thái, kể cả disabled |
| Không hồi quy nghiệp vụ | Mọi hành động hiện có vẫn tìm được trong IA mới |

---

## 11. Tiêu chí duyệt thiết kế

Một màn hình bị trả lại nếu:

- [ ] Có hơn một điểm nhấn gold
- [ ] Có mã màu không nằm trong token
- [ ] Chỉ vẽ trạng thái "có dữ liệu đẹp"
- [ ] Bảng > 10 hàng mà không có phân trang/filter theo URL
- [ ] Thông báo lỗi không nói được bước tiếp theo
- [ ] Có hành động mà người dùng vai trò đó không có quyền, hiển thị không kèm giải thích
- [ ] Không có bản mobile
- [ ] Đặt ra tên trạng thái/vai trò không có trong `@xeprime/types`
- [ ] Hiển thị số tiền không thẳng cột hoặc sai định dạng VND
- [ ] Cần một thư viện mới mà chưa nêu rõ lý do và chi phí

---

## 12. Điều tuyệt đối giữ nguyên

Thiết kế **không được** động tới các bảo đảm nghiệp vụ sau, dù vì lý do thẩm mỹ hay tiện tay:

1. Chống trùng lịch bằng ràng buộc DB (ADR 0006) — UI có thể xem trước, không được thay thế.
2. Duyệt gian hàng/xe public đi qua `approval_tasks` — không có đường tắt "bật public".
3. Tenant scope lấy từ membership ở backend — không có bộ chọn tenant phía client.
4. PII của khách mặc định che; bỏ che là một hành động có ghi audit.
5. Khách thuê không có gian hàng là **trạng thái hợp lệ**, không phải lỗi cần sửa.
6. Không có đăng ký quản trị nền tảng công khai.

Liên quan: `02_PRODUCT_VISION.md` · `06_DESIGN_PRINCIPLES.md` · `07_INFORMATION_ARCHITECTURE.md` · `08_UX_GUIDELINES.md`.
