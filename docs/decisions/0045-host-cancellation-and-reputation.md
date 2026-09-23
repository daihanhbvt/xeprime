# ADR 0045 — Quyền huỷ của chủ xe, chỉ số uy tín công khai và xếp hạng có cơ hội

Ngày: 22/09/2026 · Trạng thái: Accepted · Mở rộng: 0043 (thêm hai vế vào `rank_score`), 0044 (điều 7) · Liên quan: 0005, 0006, 0008, 0024, 0027, 0032, 0033, 0038

## Bối cảnh

ADR 0044 đặt lại thứ tự "duyệt trước, thu tiền sau". Nó mở ra một quyền mà thứ tự cũ không có: **chủ xe đã đồng ý nhận một chuyến, rồi đổi ý**. Ở ADR 0039 chuyện đó gần như không tồn tại — tiền đã về trước, và lượt duyệt là bước cuối. Nay giữa lượt duyệt và đồng tiền đầu tiên có một cửa sổ 120 phút, và sau đó còn cả quãng từ khi thành đơn tới lúc giao xe.

Bốn khoảng trống đồng thời lộ ra:

1. **Không có đường huỷ nào cho chủ xe ở `awaiting_hold`.** Xe hỏng lúc 9 giờ tối, chuyến đã nhận lúc 8 giờ — chủ xe không có nút nào, `vehicle_occupancies` vẫn giữ chỗ, và khách vẫn nhìn thấy đồng hồ đếm ngược tới một chuyến sẽ không xảy ra. Đường duy nhất khi đó là gọi điện xin lỗi và chờ hết hạn.
2. **Không có chỗ nào ghi AI huỷ và VÌ SAO.** `bookings.reason` là một ô văn xuôi; không câu SQL nào trả lời được "chuyến này hỏng vì chủ xe hay vì khách", nên mọi chỉ số dựng trên nó đều là suy đoán. Suy từ `status` cuối thì sai ở ít nhất một ca — chính `hold_expired` của ADR 0039 là ví dụ.
3. **`responseRatePercent` bị ba bề mặt tự tính lấy ba lần** (trang gian hàng, sổ ví, và mảng trạng thái rời trong `packages/types`). Hai bản đã bắt đầu trôi khỏi nhau. Một gian hàng nhìn thấy hai con số khác nhau về chính mình thì thôi tin cả hai.
4. **Sort mặc định của trang KẾT QUẢ vẫn là `rating_avg` trần** trong khi trang chủ đã chuyển sang `rank_score` từ ADR 0043. Cùng một sàn, hai bề mặt trả lời "xe nào phù hợp" bằng hai câu khác nhau — và câu ở trang kết quả có đúng cái bệnh ADR 0043 sinh ra để chữa: xe MỚI chưa ai chấm nằm dưới MỌI xe đã có đánh giá, nên sẽ mãi không ai thuê.

Điều thứ tư quan trọng hơn vẻ ngoài của nó. Một sàn hai mặt không có cơ chế khám phá sẽ tự khoá: người bán mới không có đơn nên không có đánh giá, không có đánh giá nên không lên được trang đầu, không lên được trang đầu nên không có đơn. Sàn dừng nhận người bán mới trước khi có ai nhận ra.

## Quyết định

### 1. Chủ xe huỷ được, theo từng chặng, và mỗi chặng có một đường TIỀN rõ ràng

Quyền huỷ không phải một nút chung. Nó là bốn câu trả lời khác nhau cho bốn tình huống khác nhau về tiền:

| Chặng | Hành động | Tiền | Ghi nhận |
| --- | --- | --- | --- |
| `pending_host_approval` | **Từ chối** (đường cũ) | không có gì để xử lý | `rejected_by_host` — là TỪ CHỐI, không phải huỷ; không ghi `booking_cancellations` |
| `awaiting_hold` | **Huỷ chuyến** | hold → `cancelled`; phần đã chuyển dở (`underpaid`) hoàn theo đường hoàn thường | `cancelled_by_host` + một dòng `booking_cancellations` |
| `hold_paid` (LEGACY ADR 0039) | **Huỷ chuyến** | hold `paid` → nhả và hoàn 100% | như trên |
| Đơn `reserved`/`confirmed` | **Huỷ đơn** | `HoldSettlementService` hoàn 100% cho khách — kể cả khi đã quá `free_cancel_until` | `BOOKING_STATUS.CANCELLED` + một dòng `booking_cancellations` |
| Đơn `active` | **KHÔNG huỷ** — `BOOKING_CANCEL_NOT_ALLOWED` với `details.stage = 'booking_active'` | — | — |

Ba điểm đáng nói rõ:

**`awaiting_hold` đóng trong MỘT transaction**, và transaction đó làm đủ năm việc: lật trạng thái yêu cầu bằng `updateMany` có điều kiện status (claim-by-UPDATE, không đọc-rồi-ghi), đóng hold, nhả `vehicle_occupancies` qua `OccupancyService`, ghi `booking_cancellations`, ghi `audit_logs`, và báo cả hai phía. Tiền về ĐÚNG LÚC đang huỷ thì chỉ một đường thắng: webhook cũng claim bằng điều kiện status, nên bên thua đọc `hold_closed` và khoản tiền nằm lại `bank_transactions` cho đối soát (điều 5). Bấm huỷ hai lần không tạo hai dòng hoàn — lần thứ hai không claim được gì.

**Đơn `active` KHÔNG lật thẳng sang `cancelled`.** `BOOKING_STATUS_TRANSITIONS` đã không cho phép đường đó từ trước, và đây là lúc nói tại sao nó không nên được mở: xe đang ở ngoài đường với khách. Kết thúc sớm một chuyến đang chạy phải đi qua bàn giao trả xe, quyết toán tiền thuê thực tế, thuế của phần đã dùng, và bảo hiểm đã phát hành — tức là đường `completed` với `actualReturnAt`, không phải một cú lật cờ. Một nút "huỷ" ở đây sẽ bỏ qua toàn bộ phép quyết toán đó và để lại tiền của ba bên treo lơ lửng. Lỗi trả về vì thế là một CÂU TRẢ LỜI có hướng đi, không phải một lời từ chối cụt.

**Dữ liệu LEGACY ADR 0039 phân biệt bằng DỮ LIỆU, không bằng nhãn.** `awaiting_hold` với `decided_at IS NULL` là bản ghi cũ (khách đã trả trước, chưa ai duyệt); `hold_paid` chỉ tồn tại ở thứ tự cũ. Cả hai vẫn huỷ được, và đường tiền chọn theo trạng thái HOLD chứ không theo trạng thái yêu cầu.

### 2. Trách nhiệm do SERVER suy, không do người huỷ tự khai

`booking_cancellations` là một bảng riêng, một dòng cho một lượt huỷ, khoá duy nhất theo `booking_request_id` hoặc `booking_id`. Nó lưu: ai thao tác, phía chịu trách nhiệm, nhóm lý do, chữ tự do, chặng, thời điểm, và cột dẫn xuất `counts_against_host`.

Hai cột không được lẫn vào nhau:

- **`reason_category`** — thứ DUY NHẤT người dùng chọn. Nó mô tả *vì sao*, và không đổi *ai chịu*.
- **`responsible_party`** — SERVER suy từ scope của người thao tác. Khách huỷ ⇒ `customer`; nền tảng/hệ thống ⇒ `platform`; còn lại ⇒ `host`, **kể cả khi người bấm là nhân viên được uỷ quyền**. Uỷ quyền là chuyện nội bộ của người bán; với khách, một chiếc xe bị rút lại vẫn là một chiếc xe bị rút lại.

`force_majeure` tồn tại nhưng **chỉ `platform_admin` đặt được**, sau khi xác minh. Đường huỷ của gian hàng không bao giờ gán nó. Đó chính là cái chốt giữ cho chỉ số uy tín còn nghĩa: cho chủ xe tự chọn nhãn "bất khả kháng" là xoá chỉ số đó trong một tuần.

`counts_against_host` được **lưu** chứ không suy lại lúc đọc, và một CHECK ở DB buộc nó bằng `responsible_party = 'host'`. Lưu vì quyết định "ai chịu" được chốt tại thời điểm huỷ; đổi luật về sau không được viết lại lịch sử của một người bán (cùng kỷ luật snapshot của ADR 0024).

**Chưa có chế tài nào.** Bảng này ghi nhận, và chỉ số đọc nó. Phạt tiền, hạ hiển thị cứng hay khoá gian hàng đều cần một chính sách đã công bố cho người bán trước khi áp — không có chính sách đó thì mọi chế tài là đổi luật giữa cuộc chơi.

### 3. Ba chỉ số công khai — một nguồn tính, một định nghĩa mẫu

`HostMetricsService` là **nguồn tính duy nhất**. Bốn bề mặt đọc nó: trang gian hàng công khai, khối chủ xe ở trang chi tiết xe, sổ ví của chính gian hàng, và điểm xếp hạng. `BOOKING_REQUEST_STATUS_ANSWERED` / `_UNANSWERED` / `_RESPONSE_RATE` và hàm `responseRatePercent()` ở `packages/types` bị **xoá** — chúng là ba mảng trạng thái rời mà mỗi nơi gọi tự ghép lại theo cách của mình.

**Một mẫu** = một yêu cầu thuê mà gian hàng THẬT SỰ phải quyết, trong 90 ngày gần nhất (`HOST_METRIC_WINDOW_DAYS`). Bốn nhóm nằm NGOÀI mẫu số, tất cả vì cùng một lý do — gian hàng không có cơ hội hoặc không có nghĩa vụ quyết định:

- `slot_taken` — hệ thống đóng vì khung giờ vừa thuộc về khách khác (ADR 0044 điều 6);
- `cancelled_by_customer` với `decided_at IS NULL` — khách rút trước khi có ai quyết;
- `hold_expired` với `decided_at IS NULL` — **LEGACY ADR 0039**: ở thứ tự cũ khách trả tiền trước, nên hold hết hạn nghĩa là khách bỏ giữa đường TRƯỚC khi có ai duyệt;
- `pending_host_approval` còn trong hạn — chưa ai chậm trễ cả.

| Chỉ số | Tử số | Mẫu số |
| --- | --- | --- |
| Tỉ lệ phản hồi | mẫu có `decided_at IS NOT NULL` | mọi mẫu |
| Tỉ lệ nhận và giữ chuyến | mẫu được nhận và KHÔNG bị chính gian hàng huỷ | mọi mẫu |
| Thời gian phản hồi | — | trung vị `decided_at − created_at`, **chỉ** mẫu do NGƯỜI quyết |

Sáu hệ quả, mỗi cái là một chỗ dễ làm sai:

1. **Từ chối TRONG hạn có phản hồi nhưng không phải đồng ý** — vào tử số thứ nhất, không vào tử số thứ hai. Gian hàng từ chối mọi thứ hiện 100% phản hồi / 0% nhận, đúng như sự thật.
2. **Không trả lời làm giảm CẢ HAI.** Đó không phải phạt đúp: phạt đúp là khi một yêu cầu sinh ra hai MẪU. Ở đây nó luôn là một, và vế uy tín trong xếp hạng chỉ đọc chỉ số thứ hai.
3. **Đã nhận rồi khách không trả tiền, hoặc khách tự huỷ ⇒ vẫn tính là đã nhận.** Gian hàng làm xong phần của mình (nhất quán với ADR 0044 điều 7).
4. **Gian hàng huỷ sau khi nhận ⇒ mẫu đó rời tử số thứ hai, và KHÔNG sinh mẫu thứ hai.** Một chuyến hỏng là một lần trừ điểm, không phải hai.
5. **`responded` đọc `decided_at`, KHÔNG đọc `status = rejected_by_host`.** Worker `expirePaidAwaitingAccept` (dữ liệu LEGACY) cũng ghi status đó khi gian hàng **không** phản hồi, và cố ý để trống `decided_at`. Hỏi status ở đây là trao điểm phản hồi cho đúng nhóm không phản hồi.
6. **Xe bật "Đặt ngay" không vào trung vị thời gian phản hồi** — nó quyết trong vài mili-giây, và trộn vào là quảng cáo một tốc độ trả lời thủ công không có thật. Nó hiện thành nhãn riêng ("Đặt ngay"), không bao giờ thành "0 phút".

**Dưới `HOST_METRIC_MIN_SAMPLES` mẫu thì KHÔNG hiện phần trăm.** Giao diện nói "chưa có yêu cầu nào để tính" thay vì vẽ ba ô trống. `0` mẫu thì không có gì để nói, ở bất kỳ ngưỡng nào.

> **Sửa 23/09/2026 — ngưỡng hạ từ 5 xuống 1**, theo đúng điều kiện xem lại đã ghi ở cuối ADR này.
> Bản gốc đặt 5 để một lần tung đồng xu không thành "100%" hay "0%". Trên dữ liệu thực tế, phần
> lớn chủ xe không đạt 5 yêu cầu trong 90 ngày, nên ngưỡng đó biến khối uy tín thành một dòng
> "chưa đủ dữ liệu" ở gần như mọi gian hàng — nó không bảo vệ ai, chỉ giấu mất thứ khách muốn
> đọc. `sampleCount` vẫn đi kèm nên "100% trên 1 yêu cầu" phân biệt được với "100% trên 200".
> Đánh đổi đã biết: một chủ xe bỏ lỡ đúng một yêu cầu sẽ hiện "0%" công khai. Điểm xếp hạng
> KHÔNG bị ảnh hưởng — nó đọc số thô đã làm mượt Bayes, không đọc con số đã chặn ngưỡng (điều 5).

**Thẻ kết quả tìm kiếm KHÔNG mang chỉ số.** Một trang 48 xe là 48 phép gộp — đúng cái N+1 mà `rank_score` đã tránh được bằng cách denormalize. Chỉ số xuất hiện ở trang gian hàng và trang chi tiết xe, nơi mỗi lần xem là một gian hàng.

Không có huy hiệu "5 sao", "100%" hay vương miện nào ở đây. Chữ chính ngắn; phần giải thích đầy đủ nằm sau dấu "i" — và **không bao giờ có số tiền hay hành động quan trọng nào nằm trong tooltip**.

### 4. Sort mặc định của chợ = `rank_score`; sort do KHÁCH chọn giữ nguyên tuyệt đối

`PublicListingsService.listingOrderBy()` bỏ `ratingAvg/ratingCount`, dùng `[{ rankScore: 'desc' }, { createdAt: 'desc' }]`. Ba sort do khách chọn — giá tăng, giá giảm, mới nhất — **không đổi một chữ**. Khách bấm "giá thấp nhất" thì họ muốn giá thấp nhất, không phải "giá thấp nhất theo ý chúng tôi".

`createdAt` là khoá phụ ở mọi nhánh: hai xe cùng điểm phải có một thứ tự XÁC ĐỊNH, nếu không phân trang trả cùng một xe ở hai trang khác nhau.

### 5. `rank_score` nhận thêm hai vế: uy tín chủ xe và cửa sổ khám phá

Trọng số ADR 0043 đổi từ bốn thành **sáu**, tổng vẫn bằng 1:

| Vế | 0043 | 0045 |
| --- | --- | --- |
| Chất lượng (Bayes) | 0,45 | **0,40** |
| Số chuyến (log) | 0,25 | **0,22** |
| Độ đầy hồ sơ | 0,18 | **0,16** |
| Độ mới | 0,12 | **0,10** |
| **Uy tín chủ xe** | — | **0,07** |
| **Khám phá** | — | **0,05** |

**Uy tín** = tỉ lệ "nhận và giữ chuyến" 90 ngày, **làm mượt Bayes** `(kept + w·p) / (n + w)` với `p = 0,8`, `w = 5`. Làm mượt là điều bắt buộc ở đây, vì xếp hạng — khác hiển thị — buộc phải cho MỌI xe một con số để so:

- chủ xe mới (0 mẫu) nhận đúng mức nền trung tính 0,8 — không phải 0, cũng không phải 1;
- MỘT sự cố đơn lẻ kéo xuống nhẹ (`(0+4)/(1+5) = 0,67`), không đẩy xuống đáy;
- một chuỗi dài huỷ chuyến mới kéo được về gần 0 — và lúc đó nó đáng.

Vế này có trần nhỏ (0,07) có chủ ý: nó là một tín hiệu điều chỉnh, không phải trục chính. Chênh lệch tối đa giữa một chủ xe hoàn hảo và một chủ xe huỷ mọi chuyến là 0,07 điểm — đủ để đổi thứ tự trong một nhóm ngang tài, không đủ để chôn ai vì vài mẫu.

**Khám phá** chỉ cộng cho xe thoả ĐỒNG THỜI: chưa có chuyến nào, có ảnh chính, có giá ngày, ≥4 ảnh, ≥3 tiện ích — và phai theo hàm mũ trong `RANK_DISCOVERY_DAYS` (30 ngày). Nó không phải quà cho mọi xe mới: xe khai thiếu vẫn nằm dưới xe khai đủ, và cửa sổ đóng lại sau một tháng dù có đơn hay không.

Ba quyết định về CHỖ ĐẶT của vế khám phá:

- **Nó nằm TRONG `rank_score`, không phải một bước trộn lúc đọc.** Trộn lúc đọc sẽ phá phân trang — một xe được chèn vào trang 1 rồi lại xuất hiện ở trang 2 theo thứ tự tự nhiên của nó. `rank_score` là một cột, nên thứ tự là toàn cục và ổn định.
- **`RANK_CANDIDATE_POOL` vì thế không loại xe mới trước khi khám phá kịp chạy** — điểm khám phá đã nằm trong chính con số dùng để chọn pool.
- **Xe MỚI của một chủ xe CŨ thừa hưởng uy tín thật của chủ**, nhưng vế chất lượng của chính chiếc xe vẫn là prior trung tính. Uy tín nói về cách người bán cư xử; chất lượng nói về chiếc xe — và chiếc xe đó thì chưa ai đi.

Phép phân loại mẫu trong SQL xếp hạng **trùng khít** `HostMetricsService`. Con số khách nhìn thấy và con số quyết định thứ hạng phải nói cùng một điều về cùng một người bán; một test khoá hai bên lại với nhau.

**Không có điểm nào của gói thuê bao trong xếp hạng organic.** Vị trí tài trợ, nếu mở, phải có nhãn (ADR 0028, 0043).

### 6. Hai rủi ro còn lại của ADR 0044 được đóng

**Trần hold mở đồng thời của một khách** (`HOLD_MAX_OPEN_PER_CUSTOMER`) được kiểm **ở server, trong transaction tạo hold**, sau một `pg_advisory_xact_lock(hashtext('hold:' || customer_user_id))`. Không có khoá đó, hai lượt duyệt song song cho cùng một khách cùng đọc "đang có 2" và cùng ghi thành 3. Vượt trần ⇒ `HOLD_LIMIT_REACHED` với `{ openHolds, limit }`. Quyền huỷ và quyền hoàn của khách không bị đụng tới: trần chặn việc MỞ thêm chỗ, không chặn việc đóng chỗ đang có.

**Hold của người thắng hết hạn ⇒ những yêu cầu `slot_taken` KHÔNG tự sống lại.** Hồi sinh tự động là tạo một chuyến mà cả hai bên đã quên, với một mức giá đã cũ, cho một khung giờ khách có thể đã lấp bằng xe khác. Thay vào đó worker gửi **lời mời đặt lại** (`BOOKING_REQUEST_SLOT_REOPENED`) trỏ vào CHIẾC XE, để khách gửi một yêu cầu mới ở giá và lịch hiện hành. Chống trùng bằng cột claim `slot_reopened_notified_at` (`updateMany` có điều kiện `null`), trần `REBOOK_INVITE_LIMIT = 10` mỗi lượt hết hạn.

Kèm theo đó, **câu chữ `slot_taken` được sửa**. Lúc người thắng còn chưa trả tiền, nói "xe đã đặt thành công" là nói một điều chưa đúng — và nếu người đó không trả, nó thành một điều không bao giờ đúng. Câu mới nói chiếc xe vừa được một khách khác nhận và **đang được tạm giữ**.

**Tiền về sau khi hold đã đóng** vẫn nằm lại `bank_transactions` với `match_status = unmatched` như trước — không có đường nào tạo đơn từ khoản đó. Thứ còn thiếu là hàng đợi đối soát không nói được VÌ SAO: `SepayService.noteUnmatched()` nay ghi `match_note` cho cả hai nhánh (`hold_not_found`, `hold_closed`) với câu chữ nói rõ đây là tiền về muộn cần xử lý tay. Ghi chú của admin không bị đè: phép ghi có điều kiện `match_status = unmatched`.

## Hệ quả

- **Chủ xe có một đường thoát trung thực.** Trước đợt này, xe hỏng sau khi đã nhận chuyến chỉ có đường gọi điện xin lỗi và chờ hết hạn — trong lúc chiếc xe vẫn bị khoá và khách vẫn nhìn đồng hồ đếm ngược.
- **Quyền đó có giá, và giá đó hiện ra.** Tỉ lệ "nhận và giữ chuyến" là chỗ nó hiện. Không phạt tiền, không khoá, nhưng cũng không giấu.
- **Ba con số về một gian hàng chỉ còn một nguồn.** Sổ ví và trang công khai khác nhau đúng hai tham số trình bày (cửa sổ, ngưỡng) chứ không khác phép đếm.
- **Chủ xe mới có cửa.** Một xe hồ sơ đầy đủ, chưa đánh giá, đứng trên một xe đánh giá trung bình — và vẫn dưới một xe tốt thật sự có lịch sử. Cửa đó đóng sau 30 ngày.
- **`rating_avg` thôi là trục xếp hạng** nhưng vẫn là con số HIỂN THỊ trên thẻ. Hai việc khác nhau, và trộn chúng chính là lỗi cũ.
- **Một migration, không backfill.** `booking_cancellations` bắt đầu rỗng. Các đơn `cancelled` trong lịch sử không có dữ liệu nào cho biết ai huỷ; đoán là bịa ra những con số về người thật. Chỉ số vì thế chỉ nói về 90 ngày kể từ khi bảng có dữ liệu, và cửa sổ 90 ngày tự nó giải quyết phần còn lại.

## Phương án đã cân nhắc và bỏ

- **Cho chủ xe huỷ đơn `active` bằng cách lật status.** Bỏ qua quyết toán tiền thuê thực tế, thuế phần đã dùng và bảo hiểm đã phát hành — để tiền của ba bên treo lơ lửng. Đường đúng là bàn giao trả xe sớm rồi `completed`.
- **Suy "ai huỷ" từ `status` cuối thay vì một bảng riêng.** Sai ở ít nhất một ca trong mỗi thứ tự (`hold_expired` của 0039, `cancelled` của mọi phía ở 0044), và không phân biệt được nhân viên với chủ.
- **Cho chủ xe chọn nhãn "bất khả kháng".** Xoá chỉ số uy tín trong một tuần.
- **Hiện chỉ số ngay trên thẻ kết quả.** 48 phép gộp cho một trang — đúng cái N+1 mà ADR 0043 đã tránh.
- **Trộn xe mới vào kết quả lúc ĐỌC thay vì cộng điểm vào `rank_score`.** Phá phân trang: cùng một xe xuất hiện ở hai trang.
- **Cho vế uy tín trọng số lớn (0,2+).** Với 5–10 mẫu, nó sẽ quyết thứ hạng thay cho chất lượng xe — và một chủ xe gặp một tháng xấu bị chôn trong ba tháng.
- **Hồi sinh yêu cầu `slot_taken` khi hold người thắng hết hạn.** Tạo một chuyến cả hai bên đã quên, ở một mức giá đã cũ.

## Điều kiện xem lại

- Khi có **chính sách chế tài đã công bố** cho người bán: mở phần phạt/hạ hiển thị dựa trên `counts_against_host`, và ghi nó thành một ADR riêng.
- Khi có **dữ liệu impression thật**: thay cửa sổ khám phá 30 ngày bằng một trần số lượt hiển thị. Cửa sổ thời gian là một xấp xỉ được chọn vì chưa đo được lượt nhìn — và nó là một giả định được ghi ra, không phải một sự thật.
- ~~Khi `HOST_METRIC_MIN_SAMPLES = 5` chứng tỏ quá thấp hoặc quá cao trên dữ liệu pilot.~~ → đã dùng 23/09/2026, hạ về `1` (xem ghi chú ở điều 3). Xem lại tiếp khi có đủ gian hàng vượt vài chục mẫu để ngưỡng cao trở lại có ý nghĩa.
- Khi vị trí tài trợ được mở: nhãn và ranh giới với organic phải đi qua một ADR (0028, 0043).
