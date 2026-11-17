# ADR 0095 — Kết luận chuyến cho tranh chấp ở mốc nhận xe, và xem trước tiền trước khi kết luận

Ngày: 16/11/2026 · Trạng thái: **Accepted** (16/11/2026, người dùng chốt "Mở rộng cho tranh chấp")
· Bổ sung: [0094](0094-trip-verdict-and-return-unconfirmed.md) điều 1–2,
[0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 2 và 5,
[0045](0045-host-cancellation-and-reputation.md) điều 1–2 · Nguồn: rà soát Admin 16/11/2026, việc P0-8
"cứu hộ đơn bởi nền tảng"

## Bối cảnh

ADR 0094 cho nhân sự nền tảng khép một chuyến treo ở mốc giao xe, nhưng chỉ qua case
`handover_unconfirmed`. Worker `handover-overdue` cố ý KHÔNG mở case đó khi khách đã mở tranh chấp
(`dispute`) trên đơn: khách đã lên tiếng thì không còn là "cả hai im lặng".

Hệ quả: tình huống nghiêm trọng hơn, khi khách tới nơi và tranh chấp (xe không đúng mô tả, chủ xe không
có mặt, xe hỏng), lại là tình huống nền tảng KHÔNG có công cụ nào. Chủ xe không bấm Huỷ / Khách không
đến thì đơn ở `reserved` / `confirmed` mãi: lịch xe bị chiếm, tiền giữ chỗ bị case tranh chấp giữ lại,
và nút "Chốt kết cục" ở màn Tài chính chia được tiền nhưng để đơn treo nguyên.

Hộp kết luận của ADR 0094 cũng chỉ mô tả kết cục bằng chữ ("khách được hoàn 100%"). Người trực không
thấy SỐ TIỀN từng bên nhận trước khi bấm một quyết định không đảo lại được.

## Quyết định

1. **Case `dispute` trên đơn chưa nhận xe (`reserved` / `confirmed`) dùng được kết luận chuyến.**
   Cùng endpoint `POST /platform/support/cases/:id/trip-verdict`, cùng quyền `platform.support.manage`,
   cùng một transaction và cùng thứ tự với ADR 0094 điều 2. Bốn kết luận:

   | Kết luận | Hệ quả | Phía chịu trách nhiệm (server suy) |
   | --- | --- | --- |
   | `handed_over` | Biên bản giao xe nguồn `platform`, đơn → `active` | (không huỷ) |
   | `customer_no_show` | Đơn → `no_show`, tiền chốt như huỷ muộn (ADR 0066 điều 2) | (không ghi lượt huỷ) |
   | `host_not_delivered` | Đơn → `cancelled`, hoàn khách 100% | `host`, do nền tảng xác minh |
   | `platform_cancelled` (mới) | Đơn → `cancelled`, hoàn khách 100% | `platform`: không trừ uy tín chủ xe |

   `platform_cancelled` dành cho chuyến hỏng mà không bên nào có lỗi xác minh được (hai bên thoả thuận
   huỷ, sự cố khách quan chưa đủ hồ sơ bất khả kháng). Không dùng `force_majeure`: giá trị đó cần hồ sơ
   và chỉ `platform_admin` gán (ADR 0045). Client không bao giờ gửi phía chịu trách nhiệm; nó đi theo
   MÃ kết luận.

2. **Với tranh chấp, kết luận chuyến là LỰA CHỌN, không bắt buộc.** Một tranh chấp trước giờ nhận có thể
   khép bằng thoả thuận mà chuyến vẫn diễn ra (đổi giờ, đổi điểm giao). Vì vậy `TRIP_VERDICT_CASES` mang
   cờ `required`: `handover_unconfirmed` và `return_unconfirmed` giữ `required = true` (ADR 0094 không
   đổi); `dispute` là `false`, nên nút "Kết luận" / "Đóng" trần vẫn dùng được. Một hàm
   `tripVerdictRequired` dùng chung cho chốt chặn ở server và cho màn hỗ trợ.

3. **Xem trước tiền dùng ĐÚNG phép tính của lượt thật.** `GET /platform/support/cases/:id/trip-verdict-preview`
   trả, cho từng kết luận đang dùng được: kết cục giữ chỗ, phần hoàn khách (gồm khoản chuyển thừa còn
   chờ), phần chủ xe, phần XePrime, phần trả hãng bảo hiểm. Nguồn là
   `HoldSettlementService.previewOutcome`, cùng `decideOutcome` + `allocationForHold` mà lượt chốt thật
   dùng. Lượt xem trước của khách (`previewCustomerCancel`) đi qua cùng hàm đó. `handed_over` không chốt
   tiền (tiền chốt khi chuyến kết thúc), nên trả `outcome = null`. Có case giữ tiền KHÁC còn mở trên đơn
   thì trả `deferred = true`: lượt kết luận vẫn chạy, nhưng tiền chờ người trực chốt tay.

4. **Drawer đơn của admin hiện case hỗ trợ đang mở của đơn**, kèm nhãn "Cần kết luận chuyến" khi case có
   kết luận dùng được, và lối mở thẳng case đó ở màn Hỗ trợ. Nút kết luận chỉ sống ở chi tiết case: một
   nơi ra quyết định, một dòng thời gian ghi lại.

## Không làm

- Kết luận cho tranh chấp trên đơn ĐANG CHẠY (`active`): đơn đang chạy không huỷ được (ADR 0045
  điều 1); đường đúng vẫn là bàn giao trả xe rồi quyết toán.
- Quyền mới riêng cho can thiệp đơn: lượt này là một bước xử lý case, đi cùng quyền với case
  (`platform.support.manage`, vai `platform_admin` + `support`), như ADR 0094.
- Gỡ chốt tiền tay cho tranh chấp: tranh chấp vẫn chốt tay được ở màn Tài chính (ADR 0094 điều 2 giữ
  nguyên). Lượt kết luận sau đó gặp hold đã chốt thì chỉ còn chuyển trạng thái đơn.

## Hệ quả

- `TRIP_VERDICT.PLATFORM_CANCELLED` và cờ `required` ở `packages/types/src/status/trip-verdict.ts`.
- `SupportCaseDetailDto.tripVerdictRequired` (server suy); màn hỗ trợ chỉ ẩn nút trần khi cờ này bật.
- `HoldSettlementService.previewOutcome` là nguồn duy nhất của mọi màn xem trước tiền giữ chỗ.
- `PlatformBookingDetailDto.openSupportCases` (case mở của đơn, tối đa 10).

## Cần xem lại khi nào

- Khi có số liệu: tỉ lệ `platform_cancelled` cao bất thường là dấu hiệu người trực né quy trách nhiệm;
  cân nhắc đòi `platform_admin` duyệt kết luận này.
