# 02 — Product Vision

> Ngày: 04/08/2026 · Chủ sở hữu: Product Director
> Tài liệu này trả lời "chúng ta đang xây cái gì và vì sao". Nó **không** thay thế yêu cầu nghiệp vụ đã chốt trong `docs/xeprime_build_plan_nextjs_nestjs_prod.md` và các ADR — nó nói cho biết những yêu cầu đó phục vụ mục tiêu nào.

---

## 1. Tuyên bố tầm nhìn

> **XePrime là hệ điều hành của ngành cho thuê xe Việt Nam — và cánh cửa đáng tin để thuê một chiếc xe từ nó.**

Hai vế, một sản phẩm. Vế sau không tồn tại được nếu thiếu vế trước.

---

## 2. Vấn đề thật

Một shop cho thuê xe ở Việt Nam quy mô 10–50 xe hôm nay đang vận hành bằng: một nhóm Zalo, một file Excel, một cuốn sổ, và trí nhớ của chủ. Hệ quả có thể liệt kê chính xác:

| Triệu chứng | Chi phí thật |
| --- | --- |
| Trùng lịch một chiếc xe | Mất khách + mất uy tín + đền bù |
| Không biết ai đang nợ bao nhiêu | Dòng tiền âm mà không biết vì sao |
| Nhân viên nghỉ mang theo dữ liệu khách | Mất tài sản vô hình |
| Đăng xe lên 4 nhóm Facebook | Không biết đơn nào đến từ đâu |
| Không có hợp đồng chuẩn | Tranh chấp không có gì để nói |

Khách thuê ở phía kia gặp đúng những triệu chứng đó, chỉ khác hình dạng: giá đăng một đằng thu một nẻo, xe trên ảnh khác xe nhận được, "hết xe rồi em" sau khi đã chốt.

**Điểm mấu chốt**: cả hai vấn đề là *một* vấn đề — không ai nắm được sự thật về chiếc xe đó đang ở đâu, đã cam kết cho ai, với giá nào. Sản phẩm nào giữ được sự thật đó sẽ đồng thời phục vụ được cả hai phía.

---

## 3. Chiến lược: phần mềm vận hành là hào, marketplace là nhu cầu

Đây là quyết định chiến lược quan trọng nhất và nó đã được mã hoá vào kiến trúc:

```
Chủ shop dùng XePrime để VẬN HÀNH (lịch, đơn, tiền, hợp đồng)
        ↓ dữ liệu đúng, real-time, do chính họ nhập vì họ cần nó
Marketplace hiển thị xe với availability THẬT
        ↓ khách đặt được vì tin, không bị "hết xe rồi em"
Đơn từ marketplace rơi thẳng vào hệ vận hành
        ↓ shop càng dùng, dữ liệu càng đúng
```

Vòng lặp này giải thích vì sao `public_listings` là **snapshot** được đồng bộ từ dữ liệu vận hành (ADR 0008) chứ không phải một bảng tin đăng riêng, và vì sao chống trùng lịch nằm ở **constraint database** chứ không ở tầng ứng dụng (ADR 0006). Sự thật chỉ có một bản.

**Đối thủ chỉ làm marketplace** phải đi xin dữ liệu availability từ shop và không bao giờ có được nó chính xác. **Đối thủ chỉ làm phần mềm** không mang lại đơn hàng nên khó thu tiền. XePrime chọn làm khó: cả hai — nhưng theo đúng thứ tự, vận hành trước.

---

## 4. Chúng ta phục vụ ai

### 4.1 Chủ gian hàng (`shop_owner`) — người trả tiền

Chủ 10–50 xe, 30–45 tuổi, điều hành từ điện thoại trong lúc đang ở bãi xe. Không có phòng IT. Đã từng thử một phần mềm rồi bỏ vì "rắc rối hơn Excel".

- **Việc cần làm**: biết xe nào rảnh, ai nợ tiền, tháng này lãi hay lỗ — trong dưới 10 giây.
- **Thắng khi**: buổi sáng mở app là biết hôm nay giao/nhận xe nào, không cần hỏi ai.
- **Thua khi**: phải nhập liệu hai lần, hoặc phải mở laptop mới làm được việc.

### 4.2 Nhân viên gian hàng (`shop_manager` / `shop_staff` / `shop_viewer`) — người dùng nhiều nhất

Người thực sự bấm phần mềm cả ngày. Ít quyền hơn, tốc độ quan trọng hơn.

- **Việc cần làm**: tạo đơn nhanh, thu tiền đúng, không làm sai cái mình không được phép.
- **Thắng khi**: tạo một đơn thuê hoàn chỉnh dưới 60 giây.
- **Thua khi**: gặp lỗi "không có quyền" mà không biết phải hỏi ai.

### 4.3 Khách thuê (`customer`) — người quyết định marketplace sống hay chết

Đặt xe cho chuyến đi cuối tuần, so sánh 3–4 nơi, quyết định trong 15 phút, gần như luôn trên điện thoại.

- **Việc cần làm**: tìm được xe thật, còn trống thật, giá cuối cùng rõ, đặt xong dưới 3 phút.
- **Thắng khi**: đặt xe không cần tạo tài khoản trước (đã có: OTP passwordless — `docs/guest-booking-passwordless.md`).
- **Thua khi**: bị ép đăng ký, bị hỏi thông tin không liên quan, hoặc thấy giá đổi ở bước cuối.

### 4.4 Nền tảng (`platform_admin`, `reviewer`, `support`, `finance_admin`)

Giữ chất lượng sàn và giải quyết khi có chuyện.

- **Việc cần làm**: duyệt nhanh mà không hạ chuẩn; tra được sự việc; can thiệp có dấu vết.
- **Thắng khi**: mọi hành động nhạy cảm đều có `audit_logs` và không ai xem PII mà không để lại vết.

---

## 5. Nguyên tắc sản phẩm

1. **Sự thật ở một chỗ.** Một chiếc xe, một dòng thời gian. Không có "lịch trong app" và "lịch trong Zalo".
2. **Ràng buộc thay vì lời nhắc.** Cái không được phép xảy ra thì hệ thống phải làm cho nó *không thể* xảy ra (ADR 0006), chứ không phải cảnh báo rồi cho qua.
3. **Không ép ai trở thành người khác.** Khách thuê không bị đẩy vào luồng mở gian hàng; chủ shop không bị bắt học vận hành sàn. Đây là bài học đã trả giá — xem báo cáo auth 04/08.
4. **Tiền không được mơ hồ.** Mọi con số tiền phải truy được về đơn/phiếu sinh ra nó.
5. **Quyền là thật, không phải trang trí.** Guard backend là nguồn bảo vệ; UI chỉ phản ánh.
6. **Mobile không phải bản rút gọn.** Chủ shop sống trên điện thoại; màn nào không dùng được trên điện thoại là màn chưa xong.
7. **Việt Nam trước.** Tiếng Việt, `Asia/Ho_Chi_Minh`, VND, số điện thoại `0…`, biển số, CCCD, chuyển khoản. Quốc tế hoá là chuyện sau và chỉ khi có lý do.

---

## 6. Chỉ số Bắc Đẩu

> **Số ngày-xe được vận hành trọn vẹn trên XePrime mỗi tháng**
> (một "ngày-xe trọn vẹn" = một chiếc xe có đơn thuê trên hệ thống, có thu tiền ghi nhận, và không có xung đột lịch)

Chọn chỉ số này vì nó chỉ tăng khi **cả ba** phía cùng thắng: shop thực sự vận hành trên hệ thống (không dùng song song sổ tay), tiền thực sự đi qua (không "để ngoài"), và chất lượng dữ liệu đủ tốt (không xung đột). Nó không thể bị làm đẹp bằng cách đăng thêm tin hay tạo thêm tài khoản.

### Chỉ số phụ theo persona

| Persona | Chỉ số | Ngưỡng mục tiêu |
| --- | --- | --- |
| Chủ shop | Ngày hoạt động / tháng | ≥ 20 |
| Chủ shop | % đơn có phiếu thu khớp | ≥ 90% |
| Nhân viên | Thời gian tạo một đơn thuê | ≤ 60s |
| Khách thuê | Tỉ lệ hoàn tất đặt xe từ lúc mở form | ≥ 55% |
| Khách thuê | % yêu cầu được shop phản hồi < 30 phút | ≥ 80% |
| Nền tảng | Thời gian duyệt hồ sơ gian hàng | ≤ 24h |
| Nền tảng | % hành động nhạy cảm có audit | 100% |

---

## 7. Lộ trình 3 chặng

### Chặng 1 — "Vận hành đủ tiền" ✅ (đã đạt, Phase 0–6)

Một shop có thể bỏ Excel: xe → duyệt → marketplace → khách đặt (verify SĐT) → shop duyệt → đơn thuê → lịch → thu/chi/cọc/công nợ/hợp đồng.
*Câu hỏi đã trả lời được: "phần mềm này có thay được cách tôi đang làm không?"*

### Chặng 2 — "Đáng để trả tiền hàng tháng" (hiện tại → 6 tháng)

Trọng tâm dịch từ *đủ chức năng* sang **đủ tốt để không ai muốn quay lại Excel**:

- Vận hành mượt trên điện thoại (chủ shop ở ngoài bãi, không ở bàn làm việc)
- Khách hàng của shop trở thành tài sản: lịch sử thuê, khách quen, khách đen
- Tiền khép vòng: thanh toán/cọc online, đối soát, hoá đơn gói dịch vụ
- Hỗ trợ có cấu trúc: ticket thay vì chat trôi
- Ảnh và nội dung đạt chuẩn sàn (xem `03` G-04)

### Chặng 3 — "Hạ tầng của ngành" (6–18 tháng)

- Nhiều chi nhánh/kho xe trong một gian hàng
- Kết nối bảo hiểm, định danh (eKYC GPLX/CCCD), phạt nguội
- Dữ liệu định giá: gợi ý giá theo mùa/khu vực dựa trên dữ liệu thật của sàn
- API/webhook cho shop lớn nối vào hệ thống riêng

---

## 8. Chúng ta cố tình KHÔNG làm

| Không làm | Vì sao |
| --- | --- |
| Mô hình P2P kiểu Turo (cá nhân cho thuê xe cá nhân) | Khác hoàn toàn về niềm tin, bảo hiểm, pháp lý. Ta phục vụ shop chuyên nghiệp |
| Trở thành đơn vị bảo hiểm hay tổ chức thanh toán | Tích hợp, không tự làm |
| Đặt xe theo giờ dạng scooter-sharing tự động | Vận hành khác hẳn: khoá xe, IoT, bãi |
| Ứng dụng native ngay | PWA đủ cho chặng 2; native khi cần thông báo đẩy nặng và camera nghiệp vụ |
| Đa ngôn ngữ ở chặng 1–2 | Khách quốc tế chưa phải phân khúc chính; i18n sớm làm chậm mọi màn hình |
| Microservices | CLAUDE.md §5 — modular monolith là quyết định đã chốt |

---

## 9. Định vị

|  | Marketplace thuần (Mioto, các nhóm FB) | Phần mềm quản lý thuần | **XePrime** |
| --- | --- | --- | --- |
| Nguồn khách | ✅ | ❌ | ✅ |
| Vận hành nội bộ | ❌ | ✅ | ✅ |
| Availability đúng thật | ❌ (shop tự cập nhật) | — | ✅ (cùng nguồn với lịch vận hành) |
| Tiền & công nợ | ❌ | ✅ | ✅ |
| Chi phí cho shop | Hoa hồng/đơn | Thuê bao | Thuê bao + hoa hồng đơn từ sàn |

**Câu định vị một dòng cho shop**: *"Phần mềm quản lý xe của bạn, có sẵn khách thuê đi kèm."*
**Câu định vị một dòng cho khách**: *"Xe thật, lịch thật, giá thật — vì shop đang dùng chính hệ thống này để chạy việc."*

---

## 10. Rủi ro lớn nhất

| Rủi ro | Dấu hiệu sớm | Đối sách |
| --- | --- | --- |
| Shop dùng song song với sổ tay → dữ liệu sai → marketplace mất tin | % đơn tạo tay > % đơn từ sàn và tổng đơn/xe thấp | Tối ưu tốc độ nhập liệu trên mobile; đơn tạo từ lịch bằng 1 chạm |
| Chất lượng listing kém (ảnh sai, mô tả rỗng) | Tỉ lệ chuyển đổi thấp trên trang chi tiết | Gate chất lượng lúc duyệt public + chấm điểm hồ sơ xe |
| Sàn có xe nhưng không có khách | Yêu cầu thuê/xe/tháng thấp | Chặng 2 dồn vào chuyển đổi, không thêm tính năng vận hành |
| Sản phẩm phình theo yêu cầu từng shop | Menu vượt 15 mục, nhiều trang stub | `07_INFORMATION_ARCHITECTURE.md` giữ trần IA; tính năng ngách vào cài đặt, không vào nav |

---

## 11. Định nghĩa "sản phẩm hoàn thiện" ở XePrime

Trích chuẩn chất lượng đã chốt trong CLAUDE.md §2, nêu lại ở đây vì nó là tiêu chuẩn nghiệm thu thiết kế:

> List lớn → phân trang/filter/sort **server-side** + index. Đủ trạng thái **loading / rỗng / lỗi / không đủ quyền**. Xử lý edge case. Thao tác fail-một-phần bọc transaction. **Không để lại bug đi vá sau.**

Một màn hình chỉ đẹp ở trạng thái có dữ liệu là một màn hình chưa thiết kế xong.

Liên quan: `03_PRODUCT_GAP_ANALYSIS.md` (khoảng cách tới tầm nhìn) · `04_CREATIVE_BRIEF.md` (dịch tầm nhìn thành hướng sáng tạo).
