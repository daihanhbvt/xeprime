# BỘ KỊCH BẢN KIỂM THỬ TOÀN DIỆN (FULL QA TEST MATRIX & AUTOMATION STATUS)
## LUỒNG TIỀN V2.2, MA TRẬN HOÀN HUỶ, GÁN TÀI XẾ, BÀN GIAO & QUẢN TRỊ GÓI

| Thông tin tài liệu | Chi tiết |
| :--- | :--- |
| **Mã tài liệu** | `SPEC-QA-04-FULL` |
| **Dự án** | XePrime Rental Platform |
| **Phiên bản** | `v3.2.0` (Full Verification Release) |
| **Ngày ban hành** | 22/10/2026 |
| **File Excel đồng bộ** | `docs/documents/QA_TestCases_XePrime_Booking_Financial_v3.2_Full_Suites.xlsx` |
| **Tài liệu căn cứ** | ADR 0064, ADR 0065, ADR 0066, `docs/specifications/01`–`03` |

---

## 1. MA TRẬN 7 TEST SUITES KIỂM THỬ

| Mã Suite | Tên phân hệ / Chức năng | Phạm vi kiểm thử | Số TC | Mức độ | Trạng thái Auto Test |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `TS-MONEY-01` | Luồng tiền V2.2 & Chính sách phí v9 | Phí đặt xe $S$ cố định, Hoa hồng $H$ lũy tiến (đúng tới đồng), Thuế khấu trừ theo loại dịch vụ, Bảo hiểm $IV/IP$, Giữ chỗ 15% tiền thuê | 6 | Critical | ✅ PASS (`fee-policy.test.ts`) |
| `TS-SLA-02` | SLA co giãn động & Cửa sổ thời gian | Hạn duyệt xe clamp(20%*ΔT), Hạn thanh toán 30%, Huỷ miễn phí 20%, Sàn 15 phút | 5 | Critical | ✅ PASS (`holds.test.ts`, `booking-request.test.ts`) |
| `TS-DRIVER-03`| Gán tài xế & SLA phản hồi | SLA tài xế clamp(10%*ΔT), Tài xế nhận/từ chối, Quá hạn gán lại 30p không huỷ đơn; tài xế ngoài hệ thống, nhắc thiếu tài xế 2h không tự huỷ (ADR 0067) | 7 | High | ✅ PASS (`driver-assignment-expiry.spec.ts`, `external-driver.spec.ts`) |
| `TS-HAND-04` | Bàn giao xe & Lưới chống treo đơn | Ảnh/công tơ mét tuỳ chọn, Nút đỏ "Chưa nhận xe" 120p, Hồ sơ dispute hoãn quyết toán, Worker quét, chỉ nền tảng đóng hồ sơ hoãn tiền, giao muộn tự đóng hồ sơ | 8 | Critical | ✅ PASS (`handover-anti-freeze.spec.ts`, `TripNotReceivedReport.test.tsx`) |
| `TS-REFUND-05`| Ma trận Hoàn huỷ & Quyết toán ví | Hoàn 100% trong hạn, Huỷ muộn trả 100% bảo hiểm + 15% chủ xe, Thuế huỷ = 0đ | 4 | Critical | ✅ PASS (`hold-decide-outcome.unit.spec.ts`) |
| `TS-PLAN-06` | Quản lý Gói dịch vụ & Gỡ Ghost field| Modal gói gỡ ô hoa hồng 10%, Card tuyến mặc định read-only, Gói theo loại xe ADR 0065 | 3 | High | ✅ PASS (`PlanFormModal.test.tsx`) |
| `TS-TAX-07` | Thuế khấu trừ, làm tròn tiền & Bảng cộng ví chủ xe | GTGT/TNCN theo loại dịch vụ (7% / 4,5%), doanh nghiệp đã xác minh miễn, xác minh lại khi đổi chủ thể, sổ thuế + CSV, tiền đúng tới đồng, giảm giá làm tròn lên, bảng cộng ví, sao kê ví | 11 | Critical | ✅ PASS (`fee-policy.test.ts`, `tax-withholding.spec.ts`, `owner-payout.unit.spec.ts`, `OwnerPayoutTable.test.tsx`) |

---

## 2. CHI TIẾT 44 TEST CASES ĐÃ ĐƯỢC LẬP TRÌNH & KIỂM CHỨNG

### SUITE 1: LUỒNG TIỀN V2.2 & CHÍNH SÁCH PHÍ V8 (`TS-MONEY-01`)

#### TC-MONEY-01: Tính tiền giữ chỗ ô tô tuyến hoa hồng ($S=50k + H \text{ lũy tiến} + 15\% \times B$)
* **Pre-conditions:** Chính sách phí v8 active (`depositPercent = 15`, `S_car = 50.000đ`, `ownerCommissionTiers = [10%, 7%, 3%, 0%]`).
* **Test Steps:**
  1. Đặt ô tô 5 ngày $\times$ 1.000.000đ/ngày, không bảo hiểm, không phí giao xe.
  2. Gọi hàm tính tiền lõi `computeCustomerFees`.
* **Test Data:** $B = 5.000.000đ$, số ngày = 5.
* **Expected Result:**
  * Phí sàn $S = 50.000đ$.
  * Hoa hồng $H = 2 \times 1\text{tr} \times 10\% + 3 \times 1\text{tr} \times 7\% = 410.000đ$.
  * Cọc cam kết chủ xe: $D_{\text{target}} = 15\% \times 5.000.000đ = 750.000đ$.
  * Tiền giữ chỗ QR: $\text{grossOnline} = 50k + 410k + 750k = \mathbf{1.210.000đ}$.
  * Tiền trả tay lúc nhận xe: $5.050.000đ - 1.210.000đ = \mathbf{3.840.000đ}$.
* **Trạng thái:** ✅ **PASS** (`packages/types/src/fee-policy.test.ts`).

#### TC-MONEY-02: Tính tiền giữ chỗ xe máy tuyến hoa hồng ($S=30k + 15\% \times B$)
* **Pre-conditions:** Chính sách phí v8 active (`S_moto = 30.000đ`, `depositPercent = 15`).
* **Test Steps:** Đặt xe máy 2 ngày $\times$ 150.000đ/ngày.
* **Test Data:** $B = 300.000đ$, số ngày = 2.
* **Expected Result:** $S = 30.000đ$, $H = 2 \times 150k \times 10\% = 30.000đ$, $D_{\text{target}} = 15\% \times 300k = 45.000đ$. $\text{grossOnline} = 30k + 30k + 45k = \mathbf{105.000đ}$.
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`).

#### TC-MONEY-03: Tính tiền cuốc xe tuyến gói gian hàng ($H=0đ$, Cọc bật $= 15\% \times B + S$)
* **Pre-conditions:** Gian hàng có gói thuê bao active, `billingMode = 'package'`.
* **Test Steps:** Đặt ô tô 3 ngày $\times$ 1.000.000đ trên xe của gian hàng.
* **Expected Result:** Tuyến gói $H = 0đ$ (không sinh dòng hoa hồng); $S = 50.000đ$; $D = 15\% \times 3\text{tr} = 450.000đ$; $\text{grossOnline} = \mathbf{500.000đ}$.
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`).

#### TC-MONEY-04: Tách phí giao xe $G$ ra khỏi mẫu số thuế, hoa hồng và cọc
* **Pre-conditions:** Đơn xe có thỏa thuận phí giao nhận $G = 200.000đ$.
* **Test Steps:** Tổng bảng kê `baseAmount = 5.200.000đ`, `deliveryAmount = 200.000đ`.
* **Expected Result:** Cơ sở tiền thuê tính toán $R = 5.000.000đ$. Thuế tự lái, chủ xe cá nhân: GTGT $5\% = 250.000$ + TNCN $2\% = 100.000$ ⇒ $T = 350.000đ$ (không tính trên 200k). Giữ chỗ $15\% \times 5\text{tr} = 750k$. Khoản 200k rơi trọn vào phần khách trả tay lúc nhận xe.
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`).

#### TC-MONEY-05: Cộng biểu phí bảo hiểm $IV$ và $IP$ theo ngày và loại xe
* **Pre-conditions:** Cổng bảo hiểm mở, khách tích chọn cả $IV$ và $IP$.
* **Test Steps:** Thuê ô tô 5 ngày, $IV = 50k$/ngày, $IP = 20k$/ngày.
* **Expected Result:** $\text{grossOnline}$ cộng thêm $350.000đ$ ($250k$ $IV$ + $100k$ $IP$). Dòng tiền bảo hiểm được gán người hưởng là hãng bảo hiểm (`INSURER`).
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`).

#### TC-MONEY-06: Áp mã khuyến mãi nền tảng $P$ (trừ sau, trần $D+S+H$, không đổi tiền chủ xe)
* **Pre-conditions:** Khách áp mã giảm giá nền tảng $100.000đ$.
* **Test Steps:** Tính $\text{grossOnline}$ trước mã, sau đó trừ $P = 100.000đ$.
* **Expected Result:** Số tiền quét QR SePay $= \text{grossOnline} - 100.000đ$. Tiền trả khi nhận xe, thuế $T$ và phần tiền $D$ của chủ xe giữ nguyên $100\%$. XePrime ghi nhận tài trợ contra-revenue.
* **Trạng thái:** ✅ **PASS** (`packages/types/src/promo-code.test.ts`).

---

### SUITE 2: SLA CO GIÃN ĐỘNG & CỬA SỔ THỜI GIAN (`TS-SLA-02`)

#### TC-SLA-01: Hạn phản hồi duyệt khi đặt trước $\ge 24h$ (Đúng 4 tiếng)
* **Pre-conditions:** Khách gửi yêu cầu lúc 08:00 ngày T, giờ nhận xe là 08:00 ngày T+3 ($\Delta T = 72h$).
* **Test Steps:** Gọi `bookingRequestRespondBy(createdAt, pickupAt)`.
* **Expected Result:** `respond_by = 08:00 + 4 tiếng = 12:00`.
* **Trạng thái:** ✅ **PASS** (`packages/types/src/status/booking-request.test.ts`).

#### TC-SLA-02: Hạn phản hồi duyệt khi đặt sát giờ ($< 24h$) có kẹp sàn 15 phút
* **Pre-conditions:** Khách gửi yêu cầu lúc 09:00, giờ nhận xe là 09:40 ($\Delta T = 40$ phút).
* **Test Steps:** Tính $20\% \times 40' = 8$ phút ($< 15$ phút).
* **Expected Result:** Tự động kẹp sàn $\ge 15$ phút. `respond_by = 09:15`.
* **Trạng thái:** ✅ **PASS** (`booking-request.test.ts`).

#### TC-SLA-03: Cửa sổ thanh toán QR $T_{\text{pay}} = \text{clamp}(30\% \Delta T, 15', 120')$
* **Pre-conditions:** Chủ xe duyệt lúc `acceptedAt`, $\Delta T = 100$ phút.
* **Test Steps:** Kiểm tra `expires_at` của hold trong `holdWindowsFor`.
* **Expected Result:** $30\% \times 100' = 30$ phút $\rightarrow$ `expires_at = acceptedAt + 30 phút`.
* **Trạng thái:** ✅ **PASS** (`packages/types/src/holds.test.ts`).

#### TC-SLA-04: Cửa sổ huỷ miễn phí $T_{\text{cancel}} = \text{clamp}(20\% \times (\text{pickupAt} - \text{paidAt}), 15', 120')$ — ADR 0072
* **Pre-conditions:** Chủ xe duyệt lúc T, giờ nhận T + 6 giờ; khách chuyển đủ tiền giữ chỗ lúc T + 35 phút.
* **Test Steps:** (1) Ngay sau khi duyệt, đọc `booking_holds.free_cancel_until`. (2) Bắn webhook SePay đủ tiền, đọc lại.
* **Expected Result:** (1) `free_cancel_until = NULL` (chưa có huỷ miễn phí). (2) $\Delta T_{\text{paid}} = 325'$ ⇒ $20\% = 65'$ ⇒ `free_cancel_until = paid_at + 65 phút`.
* **Trạng thái:** ✅ **PASS** (`packages/types/src/holds.test.ts` · `apps/api/test/booking-hold-lifecycle.spec.ts`).

#### TC-SLA-05: Màn thanh toán trước khi trả — không có đồng hồ huỷ miễn phí (ADR 0072)
* **Pre-conditions:** Chuyến `awaiting_hold`, chưa chuyển đủ.
* **Test Steps:** Mở `/payment/[id]`.
* **Expected Result:** Đồng hồ hạn thanh toán hiện MỘT con số cho toàn bộ thời gian còn lại (vd `1:15:45`, không phải "15:45 · giờ 2/2"); dòng *"Huỷ miễn phí: {N} kể từ lúc thanh toán thành công"*; KHÔNG có câu "huỷ miễn phí kết thúc TRƯỚC hạn thanh toán".
* **Trạng thái:** ✅ **PASS** (`apps/web/src/features/trips/use-free-cancel-note.test.tsx` · `TripDetailView.test.tsx`).

#### TC-SLA-06: Hết hạn thanh toán ⇒ tự động huỷ
* **Pre-conditions:** Chuyến `awaiting_hold`, khách chuyển thiếu 40.000đ rồi để quá `expires_at`.
* **Test Steps:** Chờ worker `booking-hold-expiry` (nhịp 60 giây).
* **Expected Result:** Hold `expired`, yêu cầu `hold_expired`, lịch xe được nhả, 40.000đ vào Ví điểm của khách, thông báo cho khách và chủ xe. Không có đơn thuê; tiền về sau hạn nằm ở hàng đợi đối soát, không tạo đơn.
---

### SUITE 3: GÁN TÀI XẾ & ĐIỀU PHỐI XE CÓ TÀI (`TS-DRIVER-03`)

#### TC-DRIVER-01: Tính hạn phản hồi tài xế $\text{clamp}(10\% \Delta T, 15', 60')$
* **Pre-conditions:** Đơn xe có tài xế được cọc thành công, chủ gian hàng gán tài xế. $\Delta T = 200$ phút.
* **Expected Result:** `driver_respond_by = now() + 20 phút`.
* **Trạng thái:** ✅ **PASS** (`apps/api/test/driver-assignment-expiry.spec.ts`).

#### TC-DRIVER-02: Tài xế chấp nhận cuốc trong hạn
* **Pre-conditions:** Tài xế mở app và bấm "Nhận chuyến" trước `driver_respond_by`.
* **Expected Result:** Gán thành công, đơn chuyển trạng thái có tài xế, khách xem được thông tin tài xế.
* **Trạng thái:** ✅ **PASS** (`driver-assignment-expiry.spec.ts`).

#### TC-DRIVER-03: Tài xế từ chối: Báo gian hàng gán lại 30 phút, KHÔNG huỷ đơn của khách
* **Pre-conditions:** Tài xế bấm "Từ chối".
* **Expected Result:** Đơn khách giữ nguyên `reserved`. Bắn notification khẩn yêu cầu gian hàng gán người khác trong 30 phút.
* **Trạng thái:** ✅ **PASS** (`driver-assignment-expiry.spec.ts`).

#### TC-DRIVER-04: Worker quét tài xế quá hạn: Tự động gỡ tài xế, kết cục expired, báo gian hàng
* **Pre-conditions:** Tài xế quá hạn không phản hồi.
* **Test Steps:** Chạy worker job `sweepDriverAssignmentExpiry`.
* **Expected Result:** Worker tự động huỷ lượt gán, cập nhật lịch sử `outcome = expired`, gửi thông báo khẩn cho gian hàng. Đơn khách giữ nguyên.
* **Trạng thái:** ✅ **PASS** (`driver-assignment-expiry.spec.ts`).

#### TC-DRIVER-05: Nhập tài xế ngoài hệ thống (ADR 0067)
* **Pre-conditions:** Đơn `with_driver` đang `reserved`, có một tài xế liên kết đang chờ nhận.
* **Test Steps:** Gian hàng nhập tài xế ngoài: tên "Nguyễn Văn B", SĐT `0912345678`.
* **Expected Result:** Lượt gán tài xế liên kết bị gỡ và người đó được báo; đơn mang tài xế ngoài, coi là đã nhận (không hạn trả lời). Trang chuyến của khách hiện tên + SĐT tài xế. Báo giá/DTO công khai không chứa dữ liệu này. Audit ghi SĐT đã che.
* **Trạng thái:** ✅ **PASS** (`external-driver.spec.ts`, `BookingDriverSection.test.tsx`).

#### TC-DRIVER-06: Kiểm tra dữ liệu tài xế ngoài hệ thống
* **Test Steps:** (a) chỉ nhập tên, thiếu SĐT; (b) SĐT sai định dạng; (c) nhập cho đơn tự lái; (d) nhập cho đơn đã kết thúc; (e) sau đó gán lại tài xế liên kết.
* **Expected Result:** (a)–(d) bị từ chối với mã lỗi rõ ràng; (e) hai cột tài xế ngoài về rỗng, lượt gán liên kết mới ở trạng thái chờ nhận.
* **Trạng thái:** ✅ **PASS** (`external-driver.spec.ts`, `BookingDriverSection.test.tsx`).

#### TC-DRIVER-07: Thiếu tài xế sát giờ — nhắc khẩn, KHÔNG tự huỷ
* **Pre-conditions:** Đơn `with_driver` `reserved`, giờ nhận còn 110 phút, không có lượt gán nào và không có tài xế ngoài.
* **Test Steps:** Chạy worker quét hai lần.
* **Expected Result:** Gian hàng nhận đúng MỘT thông báo khẩn "còn dưới 2 giờ chưa có tài xế". Đơn vẫn `reserved`, tiền giữ chỗ không đổi. Đơn có tài xế đang chờ nhận, có tài xế ngoài, hoặc giờ nhận còn hơn 2 giờ thì không bị báo.
* **Trạng thái:** ✅ **PASS** (`external-driver.spec.ts`, `BookingDriverSection.test.tsx`).

---

### SUITE 4: BÀN GIAO XE & LƯỚI CHỐNG TREO ĐƠN (`TS-HAND-04`)

#### TC-HAND-01: Bàn giao xe: Ảnh và công tơ mét là tuỳ chọn, không chặn form
* **Pre-conditions:** Đến giờ hẹn nhận xe `pickupAt`.
* **Test Steps:** Chủ xe bấm xác nhận bàn giao mà không tải ảnh hoặc nhập công tơ mét.
* **Expected Result:** Form lưu thành công, hiển thị khuyến cáo pháp lý, đơn chuyển `active` ngay.
* **Trạng thái:** ✅ **PASS** (`apps/web/src/features/handovers/components/confirm-handover-dialog.test.tsx`).

#### TC-HAND-02: Lớp 1: Khách bấm "Chưa nhận được xe" trong cửa sổ 120 phút mở dispute
* **Pre-conditions:** Đơn `reserved` hoặc `active`, thời gian nằm trong $[pickupAt, pickupAt + 120']$.
* **Test Steps:** Khách bấm nút "Chưa nhận được xe" (`TripNotReceivedReport`).
* **Expected Result:** Tạo support case loại `DISPUTE`, ưu tiên `URGENT`. Hold chuyển `hasOpenDispute = true` (đóng băng giải ngân).
* **Trạng thái:** ✅ **PASS** (`apps/api/test/handover-anti-freeze.spec.ts`, `TripNotReceivedReport.test.tsx`).

#### TC-HAND-03: Lớp 1 Idempotent: Bấm 2 lần trả về đúng 1 case
* **Pre-conditions:** Khách đã mở case dispute. Bấm lại lần 2.
* **Expected Result:** Trả về case hiện có, không tạo bản ghi trùng trong DB.
* **Trạng thái:** ✅ **PASS** (`handover-anti-freeze.spec.ts`).

#### TC-HAND-04: Khách bấm "Chưa nhận xe" ngoài 120 phút bị từ chối
* **Pre-conditions:** Đã quá 121 phút kể từ `pickupAt`.
* **Expected Result:** API trả `409 TRIP_NOT_RECEIVED_WINDOW_CLOSED` (trước giờ nhận: `TRIP_NOT_RECEIVED_TOO_EARLY`; đơn không ở `reserved`/`active`: `TRIP_NOT_RECEIVED_NOT_ALLOWED`).
* **Trạng thái:** ✅ **PASS** (`handover-anti-freeze.spec.ts`).

#### TC-HAND-05: Lớp 3: Worker sweepHandoverOverdue quét đơn reserved quá 120 phút
* **Pre-conditions:** Đơn `reserved` quá giờ hẹn 120 phút mà cả 2 bên không bấm gì.
* **Test Steps:** Chạy worker `sweepHandoverOverdue`.
* **Expected Result:** Worker tạo support case `HANDOVER_UNCONFIRMED` để CSKH gọi xác minh. Chạy lại không tạo trùng. Đơn mà khách đã báo "Chưa nhận được xe" thì không bị mở hồ sơ thứ hai.
* **Trạng thái:** ✅ **PASS** (`handover-anti-freeze.spec.ts`).

#### TC-HAND-06: Tranh chấp do gian hàng mở không "nuốt" khiếu nại của khách
* **Pre-conditions:** Gian hàng đã mở một case `dispute` cho chuyến; khách bấm "Chưa nhận được xe" trong cửa sổ 120 phút.
* **Expected Result:** Hệ thống tạo case RIÊNG của khách (người mở = khách); bấm lại vẫn trả về đúng case của khách. Banner "đang xử lý khiếu nại" của khách bám case của chính khách.
* **Trạng thái:** ✅ **PASS** (`handover-anti-freeze.spec.ts`).

#### TC-HAND-07: Chỉ nhân sự nền tảng đóng được hồ sơ hoãn tiền
* **Test Steps:** Gian hàng (hoặc khách) gọi chuyển trạng thái/đóng một case `dispute` hoặc `handover_unconfirmed`.
* **Expected Result:** `403 SUPPORT_CASE_PLATFORM_RESOLVE_ONLY`; giao diện gian hàng ẩn nút đóng. Admin nền tảng đóng được. Case loại khác gian hàng vẫn tự đóng như cũ.
* **Trạng thái:** ✅ **PASS** (`handover-anti-freeze.spec.ts`, `SupportCaseDetailPanel.test.tsx`).

#### TC-HAND-08: Chủ xe xác nhận giao muộn ⇒ hồ sơ `handover_unconfirmed` tự đóng
* **Pre-conditions:** Worker đã mở hồ sơ `handover_unconfirmed`; sau đó chủ xe xác nhận biên bản nhận xe.
* **Expected Result:** Đơn sang `active`; hồ sơ chuyển `resolved` kèm sự kiện + audit lý do `handover_confirmed`; quyết toán không còn bị hoãn. Case `dispute` của khách KHÔNG bị tự đóng.
* **Trạng thái:** ✅ **PASS** (`handover-anti-freeze.spec.ts`).

---

### SUITE 5: MA TRẬN HOÀN HUỶ & QUYẾT TOÁN VÍ (`TS-REFUND-05`)

#### TC-REFUND-01: Khách huỷ trong hạn miễn phí: Hoàn 100% vào ví điểm của khách
* **Pre-conditions:** Khách huỷ trước `free_cancel_until`.
* **Expected Result:** Hoàn 100% số khách đã chuyển (qua SePay) vào ví điểm của tài khoản khách. XePrime = 0đ, Chủ xe = 0đ, Thuế = 0đ. Lịch xe nhả ra.
* **Trạng thái:** ✅ **PASS** (`apps/api/test/hold-decide-outcome.unit.spec.ts`).

#### TC-REFUND-02: Khách huỷ muộn (ADR 0066): Hoàn 100% IV+IP, Chủ xe nhận trọn D, Sàn giữ S+H
* **Pre-conditions:** Khách huỷ sau `free_cancel_until`.
* **Expected Result:** Khách nhận lại 100% tiền bảo hiểm $IV + IP$. Chủ xe nhận trọn $D$ ($15\% \times B$). XePrime giữ $S + H - P$. Thuế $T = 0đ$.
* **Trạng thái:** ✅ **PASS** (`hold-decide-outcome.unit.spec.ts`).

#### TC-REFUND-03: Khách không đến nhận xe (No-show): Phân bổ như huỷ muộn
* **Pre-conditions:** Chủ xe báo no-show.
* **Expected Result:** Khách nhận $IV + IP$. Chủ xe nhận $D$. XePrime giữ $S + H$. Thuế = 0đ.
* **Trạng thái:** ✅ **PASS** (`hold-decide-outcome.unit.spec.ts`).

#### TC-REFUND-04: Chủ gian hàng huỷ cuốc: Khách được hoàn 100% dù đã quá mốc
* **Pre-conditions:** Gian hàng huỷ chuyến sau khi đã nhận.
* **Expected Result:** Khách được hoàn 100% toàn bộ tiền. Gian hàng bị ghi trách nhiệm huỷ chuyến.
* **Trạng thái:** ✅ **PASS** (`hold-decide-outcome.unit.spec.ts`).

---

### SUITE 6: QUẢN LÝ GÓI DỊCH VỤ & GỠ GHOST FIELD (`TS-PLAN-06`)

#### TC-PLAN-01: Modal sửa Tuyến mặc định không còn ô hoa hồng và không gửi commissionPercent thừa
* **Pre-conditions:** Mở modal sửa gói Tuyến hoa hồng mặc định (`/admin/plans`).
* **Expected Result:** Không có ô nhập % hoa hồng. Hiển thị Card giải thích tuyến vào cửa 0đ thuê bao. Payload gửi `updatePlan` không mang `commissionPercent`.
* **Trạng thái:** ✅ **PASS** (`apps/web/src/features/admin-plans/components/PlanFormModal.test.tsx`).

#### TC-PLAN-02: Văn bản i18n không còn xuất hiện câu "thu 10% ở phía khách"
* **Pre-conditions:** Rà soát `admin-plans.json` tiếng Việt và tiếng Anh.
* **Expected Result:** Đã thay bằng mô tả chuẩn Luồng tiền V2: Khách trả phí sàn cố định, chủ xe chịu hoa hồng lũy tiến.
* **Trạng thái:** ✅ **PASS** (`packages/domain/messages/vi/admin-plans.json`).

#### TC-PLAN-03: Bảy bậc gói gian hàng theo loại xe ADR 0065
* **Pre-conditions:** Mở danh mục gói `/admin/plans`.
* **Expected Result:** Hiển thị đúng 4 nhóm: Xe máy (`moto_1/5/10`), Ô tô (`car_1/5/10`), Doanh nghiệp (`enterprise_contact`), Tuyến hoa hồng. Hạn mức xe đếm đúng theo loại xe trong phạm vi của gói.
* **Trạng thái:** ✅ **PASS** (`apps/web/src/features/admin-plans/components/PlanCells.tsx`).

---

### SUITE 7: THUẾ KHẤU TRỪ, LÀM TRÒN TIỀN & BẢNG CỘNG VÍ CHỦ XE (`TS-TAX-07`)

#### TC-TAX-01: Tự lái, chủ xe cá nhân — GTGT 5% + TNCN 2%, đúng tới đồng
* **Test Steps:** Báo giá tự lái 1 ngày × 780.000đ (chính sách v9).
* **Expected Result:** GTGT 39.000 + TNCN 15.600 = **54.600đ** (không làm tròn 1.000đ). Bảng cộng ví: a = 647.400, b = 585.000, cộng ví = 62.400.
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`, `OwnerPayoutTable.test.tsx`).

#### TC-TAX-02: Có tài xế — nhóm vận tải GTGT 3% + TNCN 1,5%
* **Expected Result:** B = 780.000đ ⇒ GTGT 23.400 + TNCN 11.700 = **35.100đ**.
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`).

#### TC-TAX-03: Doanh nghiệp đã xác minh không bị khấu trừ
* **Expected Result:** Hồ sơ `company` đã xác minh ⇒ $T = 0$, bảng cộng ví ghi "Không khấu trừ (doanh nghiệp)". Hồ sơ `company` nháp / đã nộp ⇒ khấu trừ 7% như cá nhân.
* **Trạng thái:** ✅ **PASS** (`fee-policy.test.ts`).

#### TC-TAX-04: Đổi loại chủ thể / MST / CCCD trên hồ sơ đã xác minh ⇒ xác minh lại
* **Expected Result:** Hồ sơ về "đã nộp" (đủ trường) hoặc "nháp" (thiếu trường), mở lại hàng duyệt, ghi audit lý do. Đổi tên pháp lý / nơi cấp không mất xác minh.
* **Trạng thái:** ✅ **PASS** (`tenant-profile.spec.ts`).

#### TC-TAX-05: Sổ thuế + CSV kê khai tách GTGT / TNCN kèm định danh
* **Expected Result:** Dòng sổ thuế có GTGT, TNCN, nhóm, MST/CCCD + tên pháp lý chụp lúc ghi sổ; CSV có `thue_gtgt`, `thue_tncn`, `ty_le_gtgt`, `ty_le_tncn`, `nhom`, `so_dinh_danh`.
* **Trạng thái:** ✅ **PASS** (`tax-withholding.spec.ts`).

#### TC-TAX-06: Form admin — bảng mức 3 dòng × (GTGT, TNCN), căn cứ pháp lý bắt buộc
* **Expected Result:** Thiếu căn cứ hoặc % giữ chỗ < mức thuế cao nhất ⇒ bị chặn; đủ ⇒ kích hoạt được, danh sách hiện "7% · 7% · 4,5%".
* **Trạng thái:** ✅ **PASS** (`fee-policies-tax.spec.ts`, `form.test.ts`).

#### TC-ROUND-01: Tiền tính ra đúng tới đồng
* **Test Steps:** 1 ngày × 650.000đ, khuyến mãi xe 10% ⇒ B = 585.000đ.
* **Expected Result:** H = 58.500; giữ chỗ 15% = 87.750; QR = **196.250đ**; trả khi nhận xe = 438.750; thuế 29.250 + 11.700; cộng ví = 46.800.
* **Trạng thái:** ✅ **PASS** (`owner-payout.unit.spec.ts`).

#### TC-ROUND-02: Khuyến mãi % của xe làm tròn LÊN 1.000đ
* **Expected Result:** 10% × 652.000 = 65.200 ⇒ giảm **66.000đ** (khách không bao giờ được giảm ít hơn % công bố).
* **Trạng thái:** ✅ **PASS** (`rental-pricing.spec.ts`).

#### TC-ROUND-03: Mã khuyến mãi % làm tròn lên rồi kẹp trần
* **Expected Result:** Trần tài trợ 50.500đ ⇒ giảm đúng **50.500đ**, không vượt trần.
* **Trạng thái:** ✅ **PASS** (`promo-code.test.ts`).

#### TC-PAYOUT-01: Bảng cộng ví ở hộp duyệt yêu cầu và chi tiết đơn
* **Expected Result:** Đơn giá × số ngày, Doanh thu, **Phí dịch vụ – Chủ xe** (tooltip nấc), **Thuế khấu trừ (GTGT x% + TNCN y%)** (link Chính sách thuế), Thu nhập (a), Khách trả trực tiếp (b), Cộng ví (a − b). Tuyến gói ẩn dòng phí; phía khách không thấy bảng.
* **Trạng thái:** ✅ **PASS** (`OwnerPayoutTable.test.tsx`, `booking-requests-inbox.spec.ts`).

#### TC-PAYOUT-02: Sao kê ví — doanh thu không gồm phí giao xe; khách trả trực tiếp = R − D − H
* **Expected Result:** Doanh thu = 780.000 (không gồm G = 100.000), khách trả trực tiếp = 585.000, phí giao xe là dòng riêng; thay đổi số dư = a − b.
* **Trạng thái:** ✅ **PASS** (`wallet-statement.spec.ts`).
