# ADR 0093 — Thu hồi hợp đồng bảo hiểm: hoàn phí khi hợp đồng chưa từng có hiệu lực, giữ nghĩa vụ trả hãng khi đã có hiệu lực

Ngày: 16/11/2026 · Trạng thái: **Accepted** (16/11/2026 — người dùng chốt: hợp đồng đã có hiệu lực bị thu
hồi thì phí VẪN kê trả hãng cho tới khi MIC xác nhận huỷ) · Bổ sung: [0064](0064-financial-flow-v2.md)
điều 10, [0088](0088-mic-trip-insurance-integration.md), [0091](0091-insurance-owner-mode-service-fee-booking-limits.md)
điều 7 (tự hoàn khi quá giờ trả) · Nguồn: rà soát phân hệ Admin 16/11/2026

## Bối cảnh

Nút "Thu hồi" của admin (`POST /platform/money/insurance/:id/void`) chỉ đổi hợp đồng sang `voided` kèm
audit. Không có hiệu ứng tiền nào:

- Hợp đồng lỗi vĩnh viễn (`failed`) bị thu hồi: khách đã trả `IV` (+ phí thu hộ), không được bảo hiểm,
  không được hoàn. Bảng kê trả hãng chỉ lấy `issued`/`claim`, sổ đối soát coi `voided` là "quyết toán
  riêng" nhưng không có đường quyết toán nào ⇒ khoản tiền **nằm chết**.
- Hợp đồng đã cấp bị thu hồi: rơi khỏi bảng kê, nhưng hợp đồng vẫn tồn tại bên MIC và chưa có API huỷ ⇒
  XePrime còn nợ hãng mà sổ không còn ghi.
- Lý do thu hồi bị ghi đè vào `last_error_message`; không có chỗ ghi mã huỷ/biên bản bên MIC.

ADR 0091 điều 7 đã có đường TỰ hoàn khi quá giờ trả mà chưa cấp được (`InsuranceRefundService`, bút toán
`insurance_refund`, nguồn `booking_insurance_policy`). ADR này dùng lại đúng đường đó cho lượt thu hồi
của người.

## Quyết định

1. **Hai nhánh theo HIỆU LỰC, server quyết.** Hợp đồng *đã có hiệu lực* = `issued` và `coverage_from`
   đã tới (hoặc trống — coi là có hiệu lực cho an toàn). Còn lại — `failed`, hoặc `issued` mà
   `coverage_from` còn ở tương lai — là *chưa từng có hiệu lực*. Client chỉ hiện nhánh server trả về.

2. **Chưa từng có hiệu lực ⇒ huỷ + hoàn 100%.** Hợp đồng chuyển `cancelled` (không phải `voided`), ghi
   lý do; hoàn `phí + phí thu hộ` của CHÍNH hợp đồng đó vào Ví điểm của TÀI KHOẢN KHÁCH
   (`resolveRefundWalletOwner`, `WalletService.creditWithinTx`, `insurance_refund`, nguồn = hợp đồng).
   Thời điểm hoàn đi theo khoản giữ chỗ, để không bao giờ phân bổ hai lần:
   - hold ĐÃ chốt `settled` (phí đã nằm ở "phải trả hãng") ⇒ hoàn ngay trong cùng transaction;
   - hold CHƯA chốt ⇒ chỉ huỷ; vòng quét tự hoàn (5 phút, ADR 0091 điều 7) hoàn sau khi hold chốt
     `settled`;
   - hold chốt kết cục khác (`refunded`, `split_late_cancel`…) ⇒ phí đã về khách qua chính hold, không
     hoàn thêm.
   Hợp đồng `issued` (đã tồn tại bên MIC) thì BẮT BUỘC mã huỷ/biên bản đối chiếu bên MIC, và không thu
   hồi theo nhánh này được khi nó đã nằm trong một bảng kê trả hãng (`INSURANCE_POLICY_REMITTED`) — lúc đó
   tiền đã/đang chuyển hãng, phải đối chiếu với MIC trước.

3. **Đã có hiệu lực ⇒ thu hồi, KHÔNG tự hoàn.** Hợp đồng chuyển `voided`, BẮT BUỘC mã huỷ/biên bản đối
   chiếu bên MIC + lý do (`INSURANCE_VOID_REFERENCE_REQUIRED`). Phí VẪN vào bảng kê trả hãng cho tới khi
   MIC xác nhận huỷ: bảng kê và vế giữ hộ của đối soát tính cả `voided` đã từng cấp. Khoản MIC hoàn lại
   (nếu có) xử lý ngoài luồng tự động, qua đối chiếu bảng kê.

4. **Lý do và mã đối chiếu có cột riêng** (`void_reason`, `void_partner_reference`), không ghi đè lỗi
   phát hành. DB chặn `voided` đã từng cấp mà thiếu mã đối chiếu.

5. **Đối soát.** Vế giữ hộ bảo hiểm gồm thêm: hợp đồng `voided` đã từng cấp (còn nợ hãng), và hợp đồng
   `cancelled` của hold đã chốt `settled` mà CHƯA hoàn tới mốc đối soát (còn nợ khách). Một định nghĩa
   dùng chung cho vế giữ hộ, phần đã trả hãng và phần bảo hiểm nằm trong hold chưa chốt.

6. **Không gọi MIC.** MIC chưa có API huỷ; thu hồi là ghi nhận nội bộ kèm bằng chứng đối chiếu. Admin
   chưa chắc hợp đồng lỗi có thật sự không tồn tại bên MIC thì bấm "Thử phát hành lại" trước (adapter
   tra `id_tras` trước mọi việc).

## Hệ quả

- Không còn đường nào để phí bảo hiểm của hợp đồng không hiệu lực nằm chết: hoặc về ví khách, hoặc vào
  bảng kê trả hãng.
- Hộp "Thu hồi" ở màn Bảo hiểm chia hai nhánh, hiện số tiền sẽ hoàn; chi tiết hợp đồng hiện lý do, mã
  đối chiếu và khoản đã hoàn.
- `voided` không còn mang nghĩa "hợp đồng lỗi bị bỏ" — dữ liệu cũ (thu hồi hợp đồng `failed` trước ADR
  này) không có `issued_at` nên không vào bảng kê, nhưng phí của chúng chưa được hoàn: rà tay một lần.

## Cần xem lại khi

MIC công bố API huỷ hợp đồng; MIC hoàn phí cho hợp đồng đã huỷ theo một quy trình có chứng từ.
