# 09 — Page Design Order

> Ngày: 04/08/2026 · Chủ sở hữu: Product Director
> Thứ tự thiết kế màn hình, và **lý do** của thứ tự đó. Đây là kế hoạch thiết kế, không phải kế hoạch code — nhưng nó chọn thứ tự sao cho mỗi đợt thiết kế đều mở khoá được một đợt triển khai.

---

## Nguyên tắc sắp thứ tự

1. **Hệ trước, màn sau.** Không vẽ màn thứ 30 rồi mới phát hiện bảng dữ liệu có 30 biến thể.
2. **Đi theo một luồng trọn vẹn, không theo danh sách màn.** Nửa luồng đẹp không dùng được.
3. **Màn dùng nhiều nhất được thiết kế kỹ nhất.** Lịch xe được mở 30 lần/ngày; trang gói dịch vụ mở 1 lần/năm.
4. **Chỗ đang mất tiền đi trước.** Trang chi tiết xe không có lịch trống là chỗ khách rơi — nó đi trước dark theme.
5. **Mỗi màn xong là xong hẳn** (đủ 5 trạng thái + mobile), không có "bản 1 rồi hoàn thiện sau".

---

## Wave 0 — Nền hệ thống thiết kế
**Vì sao trước tiên**: mọi thứ sau đây đều là ghép các mảnh này. Vẽ chúng sau nghĩa là vẽ lại chúng 40 lần.

| # | Hạng mục | Nội dung |
| --- | --- | --- |
| 0.1 | Token hoàn chỉnh | Thang màu ngữ nghĩa (`-bg`/`-border`/`-text`), dải data-viz, bộ giá trị dark cho portal, thang chữ, thang khoảng cách |
| 0.2 | Nguyên tử | Nút (4 cấp × 5 trạng thái), ô nhập, select, ô ngày/giờ, ô tiền, ô SĐT, checkbox/radio/switch, chip lọc, chip trạng thái, avatar, badge |
| 0.3 | Phân tử | Trường có nhãn + lỗi, thanh tìm-lọc, phân trang, thanh hành động hàng loạt, ô liên hệ đã che, ô số liệu KPI |
| 0.4 | Hợp thể | **Bảng dữ liệu** (desktop) + **thẻ danh sách** (mobile) + luật chuyển đổi · drawer chi tiết · modal xác nhận · bottom sheet · wizard |
| 0.5 | Trạng thái | Bộ skeleton, trang rỗng, trang lỗi, trang 403, trang 404 |
| 0.6 | Khung | Topbar (có ô ⌘K, chuông, chat, menu người dùng) · sidebar (đủ/thu gọn) · bottom tab bar (2 biến thể) · header/footer marketplace |

**Xong khi**: dựng được màn "đơn thuê" chỉ bằng cách ghép, không vẽ thêm gì mới.

---

## Wave 1 — Luồng khách thuê hoàn tất việc đặt xe
**Vì sao**: đây là nơi sản phẩm kiếm ra nhu cầu, và là nơi có ba khoảng trống P0 (C-02, C-03, C-04). Cũng là bề mặt duy nhất người lạ nhìn thấy — chất lượng ở đây quyết định cảm nhận thương hiệu.

| # | Màn | Trọng tâm thiết kế |
| --- | --- | --- |
| 1.1 | `/` Trang chủ | Hero tìm kiếm dùng được bằng một tay; gợi ý xe; địa điểm; gian hàng nổi bật. **Giữ static render** |
| 1.2 | `/search` 🆕 | Kết quả + bộ lọc; chip lọc đang áp; đếm kết quả thật; skeleton thẻ xe; rỗng-do-lọc khác rỗng-thật |
| 1.3 | Thẻ xe | Mảnh được nhìn nhiều nhất của sản phẩm. Ảnh 4:3, tên, giá/ngày, giá gạch nếu giảm, sao thật, tỉnh, huy hiệu (giao tận nơi / miễn thế chấp) |
| 1.4 | `/listings/[id]` | **Lịch còn trống** (C-02) · **bảng giá từng dòng** (C-03) · **chính sách huỷ/thế chấp chuẩn hoá** (C-04) · gallery · hồ sơ gian hàng · đánh giá · CTA dính đáy ở mobile |
| 1.5 | Luồng đặt xe | Đã đúng mẫu từng bước — thiết kế lại bề mặt, giữ nguyên luồng và OTP |
| 1.6 | Auth modal | Đã có kiến trúc; chuẩn hoá thị giác cho cả login/register/OTP/success |
| 1.7 | `/shops/[slug]` | Bằng chứng tin cậy: số xe, số đơn hoàn tất, thời gian phản hồi, đánh giá |
| 1.8 | `/trips` + `/trips/[id]` 🆕 | Dòng thời gian trạng thái (C-10), hợp đồng, liên hệ shop, đánh giá sau chuyến |
| 1.9 | `/account` | Hồ sơ khách; upload ảnh đại diện thật (C-12) |

**Xong khi**: một người lạ đặt được xe trên điện thoại trong 3 phút mà không cần hỏi ai.

---

## Wave 2 — Nhịp làm việc hằng ngày của gian hàng
**Vì sao**: giữ chân shop. Đây là 80% thời gian sử dụng sản phẩm và là chỗ nợ trải nghiệm nặng nhất (`03` §6).

| # | Màn | Trọng tâm |
| --- | --- | --- |
| 2.1 | `/manage` Tổng quan | Đổi từ "bảng KPI" sang **"việc hôm nay"** (S-04): giao/nhận xe hôm nay, yêu cầu chờ duyệt, đơn quá hạn thu. KPI xuống hàng hai |
| 2.2 | `/manage/calendar` desktop | Lưới xe × ngày; thanh sự kiện đọc được ở 56px cột; hover xem nhanh; kéo-thả có xác nhận; **chịu được lỗi 409 từ ràng buộc DB** |
| 2.3 | `/manage/calendar` mobile | Ba chế độ: agenda ngày (mặc định) · theo xe · lưới nén. Không kéo-thả (`05` §6) |
| 2.4 | Yêu cầu thuê | Một hành động chính + `⋯`; kiểm tra trùng lịch ngay trên phiếu; từ chối phải chọn lý do |
| 2.5 | Đơn thuê — danh sách | Bảng có thứ bậc: khách+xe là cột neo, tiền căn phải tabular, trạng thái là chip |
| 2.6 | Đơn thuê — chi tiết | Có URL riêng; ba lớp danh tính → hành động → dữ liệu; thu tiền tại chỗ |
| 2.7 | **Tạo/sửa đơn thuê** | Thay modal 5 tab bằng **wizard**: Khách & xe → Thời gian & giá → Thanh toán → Xác nhận. Nâng cao (dịch vụ, ảnh) mở sau |
| 2.8 | Xe — danh sách & chi tiết | 3 chế độ xem đã có (lưới/danh sách/bảng) — chốt còn 2; hiển thị rõ trạng thái public vs trạng thái vận hành (hai thứ khác nhau, đang dễ lẫn) |
| 2.9 | Thêm/sửa xe | Upload ảnh thật + kiểm tra chuẩn ảnh ngay lúc tải lên (C-11) |

**Xong khi**: nhân viên tạo một đơn ≤ 60 giây; chủ shop mở app buổi sáng biết ngay việc hôm nay; mọi màn dùng được trên điện thoại.

---

## Wave 3 — Tiền
**Vì sao**: là lý do chủ shop trả tiền hàng tháng, và là chỗ sai một chữ số sẽ mất niềm tin vĩnh viễn.

| # | Màn | Trọng tâm |
| --- | --- | --- |
| 3.1 | Tổng quan tài chính | Doanh thu / đã thu / còn phải thu / cọc đang giữ / chi phí / lãi-lỗ. **Mỗi ô bấm được → danh sách sinh ra nó** |
| 3.2 | Thu chi | Tạo phiếu nhanh; workflow duyệt rõ ai đang chờ ai; đính kèm chứng từ |
| 3.3 | Công nợ | Sắp theo mức độ khẩn; phân biệt **quá hạn** với **chưa tới hạn**; thu tiền tại chỗ; nhắc nợ (S-10) |
| 3.4 | Hợp đồng | Bản xem, bản in (print CSS đã có), bản mobile |
| 3.5 | Bàn giao xe 🆕 | Ảnh tình trạng, số km, mức xăng, chữ ký — cả lúc giao và lúc nhận (S-03) |

**Xong khi**: con số trên dashboard khớp với sổ của chủ shop, và mỗi con số truy được về phiếu sinh ra nó.

---

## Wave 4 — Khách hàng là tài sản của shop

| # | Màn | Trọng tâm |
| --- | --- | --- |
| 4.1 | `/manage/customers` (S-01) | Danh sách khách của shop: số lần thuê, tổng chi, còn nợ, lần cuối |
| 4.2 | `/manage/customers/[id]` | Hồ sơ: lịch sử đơn, công nợ, giấy tờ, ghi chú nội bộ, đánh dấu khách cần lưu ý |
| 4.3 | Trò chuyện (portal + khách) | Realtime sau cờ `FIRESTORE_ENABLED` (S-13); trạng thái đã gửi/đã đọc; đính kèm |
| 4.4 | Đánh giá | Shop xem và phản hồi đánh giá |

---

## Wave 5 — Nền tảng

| # | Màn | Trọng tâm |
| --- | --- | --- |
| 5.1 | Duyệt hồ sơ | **Checklist chất lượng** (G-04) + **hiện lý do đã ẩn trước đó** (G-03). Đây là đòn bẩy chất lượng sàn |
| 5.2 | Ba màn giám sát | Đã có nghiệp vụ; nâng bề mặt lên chuẩn Wave 0 |
| 5.3 | Gian hàng | Drawer chi tiết + gói dịch vụ |
| 5.4 | Nhật ký | Đọc được cho người không phải kỹ sư: "ai đã làm gì với ai" |
| 5.5 | Ticket hỗ trợ 🆕 | G-01 + C-09 |
| 5.6 | Hoá đơn gói 🆕 | G-02 |

---

## Wave 6 — Hoàn thiện

| # | Hạng mục |
| --- | --- |
| 6.1 | Dark theme portal (X-01) |
| 6.2 | ⌘K (X-04) |
| 6.3 | Rà a11y toàn diện (X-06) |
| 6.4 | PWA (X-07) |
| 6.5 | Trang tĩnh `/help`, `/terms`, `/privacy` (IA-8) |
| 6.6 | Các stub còn lại: tài xế, khu vực nhận xe, thùng rác |

---

## Định nghĩa "thiết kế xong" cho một màn

Một màn chỉ được coi là xong khi có đủ:

- [ ] Desktop (1440) + mobile (375) — **cả hai đều được vẽ**, không suy diễn
- [ ] Đủ 5 trạng thái: loading (skeleton) · có dữ liệu · rỗng · lỗi · thiếu quyền
- [ ] Biến thể theo vai trò nếu màn đó khác nhau giữa các vai trò
- [ ] Dữ liệu thật trong mockup: tên Việt, biển số Việt, tiền VND đúng định dạng, ngày `dd/mm`
- [ ] Trường hợp biên: tên rất dài, không ảnh, số 0, số rất lớn, danh sách 1 dòng và 1000 dòng
- [ ] Chú thích cho kỹ sư: cái gì từ API nào, cái gì lọc ở URL, hành động nào cần quyền gì
- [ ] Không có màu/khoảng cách/bo góc ngoài token
- [ ] Trạng thái nghiệp vụ lấy từ `@xeprime/types`

---

## Việc gì có thể làm song song

| Có thể song song | Phải nối tiếp |
| --- | --- |
| Wave 1 (khách) ∥ Wave 2 (portal) — hai người khác nhau, hai bề mặt khác nhau | Wave 0 → mọi thứ. Không có ngoại lệ |
| Wave 5 (nền tảng) ∥ Wave 3 (tiền) | Wave 2.7 (wizard đơn) sau 0.4 (wizard) |
| Wave 6.5 (trang tĩnh) ∥ bất kỳ | Wave 3.1 sau khi chốt cách hiển thị tiền ở 0.3 |

Liên quan: `03_PRODUCT_GAP_ANALYSIS.md` §7 (thứ tự triển khai) · `11_FIGMA_MASTER_PROMPT.md` (prompt cho từng wave).
