# ADR 0057 — Bằng lái của tài khoản khách: nộp một lần, máy đọc tự xác thực, cổng chặn ở lúc gửi yêu cầu thuê xe tự lái

Ngày: 08/10/2026 · Trạng thái: Accepted · Mở rộng: ADR 0044 (thứ tự đặt xe — thêm một điều kiện TRƯỚC
khi gửi yêu cầu) · ADR 0053 điều 7 (cổng đặt xe ở realm khách) · Sửa 09/10/2026: bộ đọc đổi sang
Tesseract tại chỗ (điều 2b); bằng quốc tế / nước ngoài tự xác thực khi máy nhận ra đúng là bằng lái,
chủ xe đối chiếu lúc giao xe (điều 2c)

## Bối cảnh

Cho đến nay khách gửi được yêu cầu thuê xe TỰ LÁI chỉ với một số điện thoại đã xác thực. Chủ xe
không biết người sắp cầm lái có bằng hay không cho tới lúc giao xe; một khách không có bằng phù hợp
(bằng xe máy đặt ô tô, bằng hết hạn) chiếm chỗ của khách khác, rồi bị từ chối ở bãi xe.

Giấy tờ khách trong sổ khách của gian hàng (`tenant_customer_documents`) không giải quyết điều đó:
nó là bản gian hàng TỰ giữ, mỗi gian hàng một bản, không ai xác thực, và chỉ có sau khi đã có đơn.

Yêu cầu sản phẩm (08/10/2026): khách đặt xe lần đầu phải xác thực bằng lái bằng ảnh mặt trước; xác
thực TỰ ĐỘNG khi ảnh đủ điều kiện; không cần chứng minh bằng là thật 100% — chỉ cần ảnh đủ thông tin;
làm GPLX Việt Nam, và cả bằng quốc tế nếu được.

## Quyết định

1. **Bằng lái thuộc TÀI KHOẢN KHÁCH, nộp cho NỀN TẢNG một lần.** Bảng `customer_driver_licences`,
   mỗi lượt nộp một dòng (lịch sử giữ nguyên). Hai bất biến do DB giữ bằng partial unique: tối đa
   MỘT dòng `verified` (bằng đang dùng) và tối đa MỘT lượt nộp đang dở (`uploading` | `processing`
   | `pending_review`) cho mỗi tài khoản. Chỉ realm `customer` (cột `realm` cố định + FK tổ hợp tới
   `users(id, realm)`). Writer duy nhất: `DriverLicencesService`.

2. **Máy đọc ảnh, LUẬT CỦA SERVER quyết.** Bộ đọc (khớp nối trung lập `DriverLicenceReader`) chỉ KỂ
   LẠI những gì thấy trên ảnh. `decideFromReading` quyết:
   - **Bằng quốc tế (IDP) và bằng nước ngoài:** xem điều 2c — máy chỉ kiểm "đúng là một tấm bằng
     lái", không kiểm hạng/hạn.
   - **Tự xác thực GPLX Việt Nam** khi: mặt trước, đọc rõ; có số bằng, họ tên, hạng, hạn (hoặc
     "không thời hạn"); còn hạn; hạng lái được ô tô hoặc xe máy; độ tin cậy không thấp; ngày sinh
     hợp lý.
   - **Tự từ chối** khi lý do là thứ khách sửa được ngay: không phải bằng lái, mặt sau, ảnh không đọc
     được, thiếu trường, hết hạn, không có hạng lái được xe cho thuê. Với bốn lý do máy có thể đọc
     sai (`unreadable`, `missing_fields`, `expired`, `no_drivable_class`), khách được nhờ người xem
     lại MỘT lần. `expired` nằm trong nhóm này vì máy đọc chữ có thể đọc lệch một chữ số ngày tháng.
   - **Chờ người duyệt** khi: độ tin cậy thấp, hạn hay ngày sinh bất thường, bộ đọc hỏng / bị tắt /
     quá tải, hoặc khách nhờ xem lại.
   - Không kiểm tính thật của giấy tờ (đúng yêu cầu sản phẩm). Chủ xe vẫn đối chiếu bằng gốc khi
     giao xe — xác thực ở đây là "khách đã khai một bằng hợp lệ", không phải "giấy tờ là thật".

2b. **Bộ đọc là Tesseract chạy NGAY TRONG tiến trình API** (09/10/2026, thay bản Claude vision của
   bản nháp đầu). Lý do: sản phẩm chỉ cần chặn ảnh linh tinh và chấp nhận một ít từ chối oan, còn
   một mô hình thị giác tốn ~500–1.300đ mỗi lượt và đưa ảnh PII ra nhà cung cấp nước ngoài.
   Tesseract (`tesseract.js` — lõi WASM trong một worker thread, dữ liệu tiếng Việt đóng gói trong
   node_modules) không khoá, không gọi ra ngoài, không tốn phí theo lượt; ảnh không rời máy chủ.
   - Mỗi ảnh đọc **ba lượt** (ảnh gốc · xám phóng to · đen trắng) rồi **bỏ phiếu** từng trường: chỉ
     khi ÍT NHẤT HAI lượt đọc giống nhau (và nhiều hơn phần lệch) trường đó mới đáng tin — một lượt
     lẻ, dù Tesseract chấm cao, là tin cậy THẤP ⇒ người duyệt. Độ tin cậy lấy theo TỪNG KÝ TỰ, không
     theo cả "từ" (Tesseract hay dính số bằng vào chữ rác bên cạnh). Còn mập mờ thì đọc thêm MỘT lượt
     phân xử (cân bằng sáng cục bộ). Ảnh xoay ngang/dọc được thử ở 90°/270°/180° khi lượt đầu không
     thấy chữ của một giấy tờ nào.
   - **Ảnh không có một dấu hiệu bằng lái nào** (không tiêu đề, không nhãn trường, không số bằng,
     không bảng hạng — ảnh linh tinh, kể cả chữ nước ngoài máy không đọc nổi) ⇒ `not_a_licence`, từ
     chối NGAY, KHÔNG được nhờ xem lại: hàng đợi duyệt tay không phải chỗ cho ảnh rác. Có dấu hiệu
     bằng lái nhưng đọc không chắc ⇒ `unreadable` (được nhờ xem lại).
   - **Hạng chỉ nhận chữ IN HOA** liền sau nhãn "Hạng/Class": nhiễu hay gặp nhất là một chữ thường
     lẻ (`e`, `c`, `d`) — viết hoa nó lên là biến bằng xe máy A1 thành bằng ô tô (E/C/D cũ).
   - **Hạn bất thường ⇒ người duyệt** (`implausible_expiry`): bằng lái được ô tô mà "không thời hạn",
     hạn không sau ngày cấp, hay hạn xa hơn 10 năm (`B1` mẫu cũ: tới tuổi 60) — một chữ số đọc lệch
     không được biến thành tấm bằng đi qua cổng đặt xe mãi mãi.
   - Chữ → trường bằng so khớp NHÃN gần đúng trên chữ đã bỏ dấu (`licence-text.ts`), có đường lui
     theo cấu trúc thẻ (hai ngày dd/mm/yyyy trên mặt trước là ngày sinh và hạn), và chỉ sửa một lỗi
     đọc số khi giá trị không thể đúng (ngày 45 → 15). CCCD / hộ chiếu / đăng ký xe bị nhận ra bằng
     tiêu đề của chính chúng — CCCD có cùng quốc hiệu, cùng số 12 chữ số và cả "Có giá trị đến".
   - Một worker cho cả tiến trình, chạy tuần tự, khởi động lười và tự tắt sau 3 phút rảnh (+~230MB
     RAM cho tiến trình API khi đang đọc, 1–4 giây CPU một ảnh). Không nhánh nào chờ tesseract.js mà
     không có hạn (thư viện để `createWorker` treo vĩnh viễn khi dữ liệu hỏng, và không nhả việc dở
     khi worker bị tắt): khởi động có hạn 20 giây, lượt đọc 60 giây, thread chết thì việc đang chờ
     được nhả ngay; quá 20 lượt chờ ⇒ `OCR_BUSY` vào hàng đợi duyệt tay. Thiếu dữ liệu tiếng Việt lúc
     khởi động ⇒ log lỗi và rơi về duyệt tay. Công tắc `DRIVER_LICENCE_OCR=off` đưa mọi lượt nộp về
     hàng đợi duyệt tay mà không cần deploy code.
   - **Giới hạn đã biết:** đọc lệch chữ số mà các lượt cùng lệch thì bỏ phiếu không bắt được (trên
     ảnh mẫu chụp nghiêng, cả ba lượt đọc hạn "15/03/2031" thành "05/03/2031"); họ tên hay sai dấu
     ("NGUYÊN" cho "NGUYỄN"). Sai ở ngày hạn có thể theo cả hai chiều — vì vậy chủ xe đối chiếu bằng
     gốc lúc giao xe vẫn là lớp kiểm cuối. Bộ ảnh mẫu (`test/fixtures/driver-licences/`, 14 ảnh) là
     ảnh dựng, chưa phải ảnh điện thoại thật.

2c. **Bằng quốc tế / nước ngoài TỰ XÁC THỰC, chủ xe đối chiếu lúc giao xe** (chính sách chủ sản
   phẩm, 09/10/2026: "không cần quá chặt chẽ, chủ xe sẽ duyệt khi giao xe").
   - Pháp lý tham chiếu: người nước ngoài lái xe ở Việt Nam cần GPLX Việt Nam (đổi từ bằng nước họ),
     HOẶC IDP cấp theo Công ước Viên 1968 MANG KÈM bằng quốc gia; bằng quốc gia một mình không đủ, và
     IDP mẫu 1949 (Công ước Geneva — vd Mỹ) không được công nhận. Nền tảng KHÔNG chặn theo các luật đó
     ở bước nộp ảnh — chủ xe là người kiểm, và màn nộp ảnh nhắc khách mang bằng gốc (+ IDP 1968).
   - Máy chỉ kiểm "đúng là một tấm bằng lái": có chữ bằng lái của nước ngoài / IDP, MỘT ngày tháng,
     MỘT mã số giấy tờ (chữ + ≥ 4 chữ số), và cỡ chữ của một tấm thẻ (không phải một trang chữ). Đủ ⇒
     tự xác thực; thiếu ngày/mã số ⇒ `unreadable` (chụp lại); cả một trang chữ ⇒ `not_a_licence`.
   - Bằng đã xác thực KHÔNG có hạng/hạn (máy không đọc được tin cậy: IDP đóng DẤU vào ô hạng, ngày mỗi
     nước một định dạng) ⇒ được coi là lái được cả ô tô lẫn xe máy, và "hạn chưa đọc được" KHÔNG
     phải "hết hạn" ở cổng đặt xe (`licenceValidThrough` theo `kind`). DB cho dòng `verified` của
     bằng nước ngoài thiếu số/họ tên/hạng/hạn (migration `20261009090000`); GPLX Việt Nam vẫn đủ.
   - Hệ quả phải biết: một bằng nước ngoài hết hạn, hay chỉ có hạng xe máy, vẫn qua cổng đặt xe ô tô —
     lớp kiểm duy nhất là chủ xe lúc giao xe.

3. **"Lái được gì" suy TẤT ĐỊNH từ hạng** (`licenceClassCoverage` ở `@xeprime/domain`, dùng chung API
   và web): GPLX Việt Nam mẫu cũ (A1/A2 xe máy; B1, B2, C, D, E, F… ô tô) và mẫu từ 01/01/2025 (A1, A
   xe máy; B, C1, C, D1, D2, D, BE… ô tô) — `B1` ĐỔI NGHĨA giữa hai hệ nên ngày cấp quyết định; IDP
   theo Công ước Viên 1968 (dùng khi NGƯỜI DUYỆT chốt hạng của một IDP — máy không đọc hạng IDP,
   điều 2c). Bằng nước
   ngoài không có bảng tra đúng cho mọi nước ⇒ người duyệt chốt.

4. **Cổng chặn ở lúc GỬI YÊU CẦU** (`POST /public/booking-requests`), chỉ với dịch vụ tự lái và dài
   hạn (thuê có tài xế: người cầm lái là tài xế của gian hàng). Bằng phải: đã xác thực, đúng hạng cho
   loại xe, còn hạn tới HẾT ngày cuối của chuyến (dài hạn: ngày nhận muộn nhất khách nêu + số tháng
   lịch của gói — `licenceTripLastDayKey`). Bốn mã lỗi: `DRIVER_LICENCE_REQUIRED` ·
   `DRIVER_LICENCE_PENDING_REVIEW` · `DRIVER_LICENCE_EXPIRED` · `DRIVER_LICENCE_CLASS_MISMATCH`.
   Khách chưa đăng nhập bị soát TRƯỚC khi tạo tài khoản theo SĐT (không để lại tài khoản rỗng).
   Công tắc rollout `DRIVER_LICENCE_ENFORCEMENT` (`on` mặc định, `off` thoát hiểm).

5. **Luồng web:** `Chuyến đi → [OTP] → [Bằng lái] → Xác nhận`. Bằng lái gắn với tài khoản, nên khách
   vãng lai thuê tự lái nhận mã OTP **đăng nhập** (`/auth/phone/login`) thay cho mã xác minh đơn lẻ —
   cùng một SMS, cùng tài khoản mà bước gửi sẽ tạo, chỉ sớm hơn. Bằng đã hợp lệ cho chuyến thì khách
   không bao giờ thấy bước bằng lái. Trang "Giấy tờ & Xác minh" (`/account/documents`) dùng chung bộ
   xác thực.

6. **Đọc ảnh chạy NỀN.** `complete` kiểm ảnh (kích thước khai báo + chữ ký định dạng) rồi trả về ngay
   ở `processing`; client hỏi lại mỗi 1,5 giây. Lượt đọc kẹt quá 5 phút (tiến trình khởi động lại)
   tự sang hàng đợi duyệt. Ảnh được nén ở trình duyệt về cạnh dài 2000px, mã hoá lại JPEG (bỏ EXIF/
   GPS), trần 5MB.

7. **Hàng đợi duyệt của nền tảng** — quyền riêng `platform.driver_licences.review` (platform_admin,
   reviewer, support). SĐT/email chủ tài khoản LUÔN che, kể cả ở chi tiết: quyền duyệt bằng lái
   không phải quyền xem PII khách — cần liên hệ thì đi qua "Hiện liên hệ" của màn Khách thuê
   (`platform.customers.view_pii` + audit). Ảnh mở qua URL sống 120 giây, **mỗi lần mở một dòng
   audit**; duyệt/từ chối ghi audit trong cùng transaction; duyệt bằng mới chuyển bằng cũ sang
   `superseded` trong cùng transaction.

9. **Không giữ ảnh lâu hơn cần thiết.** Ảnh (không phải dòng metadata) bị xoá khỏi R2 và đánh dấu
   `image_deleted_at` ngay khi: lượt nộp bị huỷ (khách nộp ảnh khác), bằng bị thay bởi bằng mới, và
   — khi khách vừa có bằng hợp lệ — mọi lượt bị từ chối trước đó (thường là ảnh CCCD/hộ chiếu chụp
   nhầm). Còn lại sau bản này: ảnh của lượt bị từ chối mà khách KHÔNG nộp lại, và ảnh của tài khoản
   bị xoá (dòng xoá theo `ON DELETE CASCADE`, object R2 thì chưa) — cần một job dọn định kỳ khi
   worker có quyền truy cập R2.

8. **Không thông báo in-app ở bản này.** Thêm `NOTIFICATION_TYPE` làm vỡ các bảng `Record<…>` của app
   native; trang web tự hỏi lại trạng thái (30 giây khi đang chờ duyệt). Thông báo kết quả duyệt tay
   đi cùng đợt app native có bước bằng lái.

## Hệ quả

- App native gửi yêu cầu tự lái sẽ nhận `DRIVER_LICENCE_*` cho tới khi có bước nộp bằng (bốn câu lỗi
  đã có ở `packages/domain/messages/*/errors.json`, dùng chung). Nếu cần mở lại đặt xe trên app trước
  đó: `DRIVER_LICENCE_ENFORCEMENT=off` — luồng nộp/duyệt trên web vẫn chạy.
- `DRIVER_LICENCE_OCR=off` (hoặc bộ đọc hỏng) ⇒ mọi lượt nộp vào hàng đợi duyệt tay; KHÔNG BAO GIỜ
  tự xác thực khi chưa đọc được ảnh.
- Khách nước ngoài (IDP, bằng quốc gia khác) đặt được xe tự lái ngay khi máy nhận ra bằng; chủ xe
  là lớp kiểm hạng / hạn / IDP 1968 duy nhất (điều 2c).
- Tài khoản demo: `khach.an@` và `khach.binh@` có bằng đã xác thực; `khach.cuong@` để trống để thử.

## Điều kiện phát hành (production)

- Cập nhật chính sách quyền riêng tư nêu mục đích xử lý ảnh bằng lái và thời hạn lưu. Ảnh được đọc
  ngay trên máy chủ XePrime (không gửi bên đọc ảnh nào); câu đồng ý trên màn nộp ảnh đã có và được
  ghi `consented_at`.
- Thử bộ đọc trên vài ảnh GPLX THẬT chụp bằng điện thoại (`licence:try ./anh.jpg` — ảnh không rời
  máy) và chỉnh ngưỡng nếu cần; bộ ảnh mẫu hiện tại là ảnh dựng.
- Job dọn ảnh định kỳ cho phần điều 9 còn để lại (lượt bị từ chối không nộp lại, tài khoản đã xoá),
  với thời hạn lưu giữ được nêu trong chính sách quyền riêng tư.

## Điều kiện xem lại

- Tỉ lệ sang hàng đợi duyệt tay hoặc tỉ lệ "nhờ xem lại" vượt ~20% lượt nộp, hoặc phát hiện gian
  lận bằng ảnh giả ⇒ cân nhắc nhà cung cấp eKYC trong nước (đối chiếu dữ liệu quốc gia/VNeID) thay
  hoặc bên cạnh Tesseract — chỉ cần một `DriverLicenceReader` mới, luật quyết định giữ nguyên.
- Một ca chủ xe phát hiện bằng hết hạn mà máy đã xác thực (đọc lệch ngày hạn — bỏ phiếu không bắt
  được khi cả ba lượt cùng lệch) ⇒ chuyển sang người duyệt những bằng có hạn đọc được nằm trong vài
  tháng tới: lệch một chữ số chỉ thành chuyện khi hạn thật sát ngày chuyến.
