# Quản trị bảo hiểm chuyến — sổ tay vận hành ở admin

> Cập nhật: 11/11/2026 · Người đọc: nhân sự vận hành nền tảng (admin, kế toán) và kỹ sư bảo trì
> tính năng. Quyết định gốc: [ADR 0088](../decisions/0088-mic-trip-insurance-integration.md) (MIC VCX
> theo chuyến) · [ADR 0089](../decisions/0089-vehicle-registration-at-car-create.md) (cà vẹt khi tạo ô
> tô) · [ADR 0090](../decisions/0090-vehicle-master-data-catalog.md) (giá trị xe gợi ý từ dữ liệu xe
> chuẩn). Mâu thuẫn với ADR thì ADR thắng.

## 1. Bức tranh một trang

XePrime bán **bảo hiểm vật chất xe theo chuyến** của MIC (sản phẩm `xel_chuyen`, loại xe `M1.11` — xe
cho thuê tự lái) như một dòng `IV` trên đơn thuê. XePrime **giữ hộ** phí rồi trả MIC theo **bảng kê
tháng**, trừ hoa hồng đại lý.

```text
Chủ xe khai xe đủ điều kiện + chọn Bắt buộc/Tuỳ chọn ─► Khách đặt xe: báo giá có dòng IV khi xe Bắt buộc hoặc khách tích (không gọi MIC)
        ─► Tiền giữ chỗ về đủ: đơn thuê ra đời, lượt bảo hiểm ở trạng thái "reserved"
        ─► Mốc giao xe: worker tra cứu id_tras → gửi ảnh xe → validate → cấp GCN ("issued")
        ─► Cuối tháng: admin lập bảng kê → chốt → chuyển tiền MIC → đánh dấu "đã trả"
```

| Ai | Làm gì | Ở đâu |
| --- | --- | --- |
| Chủ xe | Khai giá trị xe, chụp 5 ảnh bắt buộc, chụp cà vẹt, đủ hãng/mẫu/năm/số chỗ | Site partner — form xe, tab Giấy tờ |
| Khách | Thấy dòng "Bảo hiểm vật chất xe · Bắt buộc" trên báo giá; tải GCN sau khi nhận xe | Site khách — trang xe, chi tiết chuyến |
| Worker | Cấp GCN ở mốc giao xe, thử lại khi MIC lỗi tạm thời | `apps/worker` |
| Admin vận hành | Theo dõi GCN, xử lý lượt cấp lỗi, huỷ GCN | Admin › Bảo hiểm › Chứng nhận |
| Kế toán | Lập/chốt/trả bảng kê tháng, xuất CSV | Admin › Bảo hiểm › Bảng kê |
| Admin sản phẩm | Sửa biểu phí bậc, mức khấu trừ, hotline, bật/tắt sản phẩm | Admin › Bảo hiểm › Sản phẩm |

## 2. Màn Admin › Bảo hiểm — ĐANG CÓ

Ba tab, mỗi tab gác bằng một quyền riêng (ẩn tab chỉ là trang trí — server chặn endpoint):

| Tab | Quyền | Endpoint |
| --- | --- | --- |
| Chứng nhận (GCN) | `platform.money.manage` | `GET /platform/insurance-policies`, `GET :id`, `GET :id/certificate.pdf`, `POST :id/retry`, `POST :id/void` |
| Bảng kê | `platform.money.manage` | `/platform/insurance-remittances` (danh sách, `pending`, tạo, chi tiết, dòng, `export.csv`, `finalize`, `pay`, xoá nháp) |
| Sản phẩm | `platform.insurance.manage` | `GET/PATCH /platform/insurance-products` |

### 2.1 Tab Chứng nhận

Mỗi dòng là một lượt bảo hiểm của một đơn. Trạng thái (`INSURANCE_POLICY_STATUS`):

| Trạng thái | Nghĩa | Việc của admin |
| --- | --- | --- |
| `reserved` | Đơn đã có, chưa tới mốc giao xe | Không làm gì |
| `issuing` | Worker đang cấp | Chờ; kẹt quá lâu thì xem log worker |
| `issued` | Đã có GCN (mã MIC, hiệu lực từ giao xe + 5 phút) | Tải PDF khi khách/chủ xe hỏi — bản lưu R2 riêng tư (vòng quét API lưu trước sau khi cấp; chưa có thì tải MIC rồi lưu — ADR 0091) |
| `failed` | Cấp thất bại | Đọc mã lỗi, sửa nguyên nhân, bấm **Thử lại** |

Mã lỗi (`INSURANCE_ISSUE_ERROR`) và cách xử lý:

| Mã | Nguyên nhân thường gặp | Xử lý |
| --- | --- | --- |
| `partner_not_configured` | `INSURANCE_PARTNER` / bộ `MIC_*` thiếu ở môi trường đó | Sửa GitHub Environment rồi deploy lại — **không** sửa tay `.env` trên VPS |
| `partner_unavailable` | MIC timeout / 5xx / sai IP whitelist | Worker tự thử lại; vẫn lỗi thì kiểm IP VPS có trong whitelist MIC |
| `partner_rejected` | MIC từ chối dữ liệu (số khung sai, ảnh hỏng…) | Nhờ chủ xe sửa cà vẹt/ảnh, rồi Thử lại |
| `invalid_request` | Dữ liệu phía XePrime thiếu | Báo kỹ sư — đây là lỗi của mình |

**Huỷ GCN** (`void`) chỉ dùng khi đơn bị huỷ trước nhận xe mà GCN đã lỡ cấp, hoặc cấp nhầm. Mọi thao
tác Thử lại / Huỷ ghi `audit_logs`.

### 2.2 Tab Bảng kê

Vòng đời `draft → finalized → paid` (`INSURANCE_REMITTANCE_STATUS`):

1. **Tạo nháp** cho một tháng: hệ thống gom mọi GCN `issued` chưa thuộc bảng kê nào, tính tổng phí
   và hoa hồng đại lý (`tổng phí × %`, đúng tới đồng — `insuranceRemittanceCommission`).
2. **Rà dòng** + **xuất CSV** gửi MIC đối chiếu. Nháp xoá được.
3. **Chốt** khi MIC đồng ý số liệu — từ đây không thêm/bớt dòng.
4. **Đánh dấu đã trả** kèm mã giao dịch ngân hàng (tối đa 100 ký tự) sau khi chuyển khoản.

Hoa hồng tối đa 50%, hai chữ số lẻ (`INSURANCE_REMITTANCE_LIMITS`).

### 2.3 Tab Sản phẩm

Sửa được: tên/quyền lợi hai ngôn ngữ, mức khấu trừ, mức chi trả tối đa, hotline bồi thường, thứ tự,
bật/tắt, và **biểu phí bậc** (`premium_tiers_json` — tối đa 10 bậc, mỗi bậc "tới N ngày → % giá trị
xe", tối đa 30 ngày). Biểu phí khởi tạo đo trên sandbox MIC 11/11/2026 (`MIC_VCX_TRIP_DEFAULT_TIERS`);
**khi MIC đổi biểu phí production, admin sửa ở đây** — báo giá áp ngay cho yêu cầu MỚI, đơn cũ giữ phí
đã đóng băng.

Không sửa được ở màn này (cố ý): nhà cung cấp, loại sản phẩm, mã sản phẩm của đối tác, cách tính phí.
Sản phẩm tai nạn người (`personal_accident`) đang **tắt** (MIC chưa mở cho XePrime).

## 3. Điều kiện để một xe được bán kèm bảo hiểm

Một ô tô tự lái, chuyến ≤ 30 ngày, được chào bán `IV` khi đủ cả năm điều (`insuranceEligibilityGaps`,
`GET /vehicles/:id/insurance-eligibility`):

| Mã thiếu | Chủ xe cần làm |
| --- | --- |
| `not_car` | — (xe máy chưa có sản phẩm) |
| `insured_value_missing` | Khai **giá trị xe** (50 triệu – 20 tỷ, bội 1 triệu). Từ ADR 0090 form gợi ý giá trị tham khảo theo xe chuẩn ở màn Dữ liệu xe |
| `photos_missing` | Đủ 5 ảnh bắt buộc của thư viện xe |
| `registration_missing` | Cà vẹt có số khung + tên chủ (bắt buộc khi tạo ô tô trên web, ADR 0089) |
| `vehicle_info_missing` | Hãng, mẫu, năm sản xuất, số chỗ |

Xe chưa đủ ⇒ **không có `IV`** (không rơi về biểu phí ngày). Phí = giá trị xe × % bậc thời lượng.

## 4. Cấu hình theo môi trường

| Biến | dev | staging | production |
| --- | --- | --- | --- |
| `INSURANCE_PARTNER` | `mic_mock` (GCN TEST) | `mic` | `mic` khi hợp đồng ký xong; trước đó `none` |
| `MIC_SANDBOX` | — | `true` (GCN `TEST-`) | **`false`** — server từ chối boot nếu `mic` + `true` |
| `MIC_*` | — | GitHub Environment (Secret) | GitHub Environment (Secret) |

Mật khẩu/secret MIC **chỉ** ở GitHub Environment, không vào repo, docs hay log. MIC chỉ nhận gọi từ
IP đã whitelist (staging hiện tại). Thân lỗi thô của MIC không được ghi log (401 chứa token).

## 5. Việc định kỳ

| Tần suất | Việc | Người |
| --- | --- | --- |
| Hằng ngày | Lọc tab Chứng nhận theo `failed`, xử lý theo bảng 2.1 | Vận hành |
| Hằng tuần | Rà xe có giá trị khai lệch xa giá trị tham khảo (mục 6.2, khi có) | Vận hành |
| Đầu tháng | Lập bảng kê tháng trước → gửi MIC → chốt → trả | Kế toán |
| Khi MIC đổi biểu phí | Sửa bậc ở tab Sản phẩm, ghi chú ngày hiệu lực vào audit | Admin sản phẩm |
| Hằng quý | Cập nhật giá bán xe mới ở màn Dữ liệu xe (tài liệu `11`) — đầu vào của giá trị tham khảo | Admin dữ liệu |

## 6. Định hướng — CHƯA làm (đợt sau)

Ghi để không ai phải đoán; mỗi mục khi làm cần đối chiếu lại ADR 0088.

### 6.1 Tab "Xe & điều kiện"

Danh sách ô tô của toàn nền tảng kèm trạng thái đủ điều kiện và mã thiếu, lọc theo gian hàng/mã
thiếu, phân trang server. Mục đích: biết bao nhiêu xe đang bán được bảo hiểm và nhắc đúng chủ xe.
Cần một endpoint đọc gộp (không gọi `insuranceEligibilityGaps` từng xe — N+1) và index phù hợp.

### 6.2 Cảnh báo giá trị xe bất thường

So `vehicles.insured_value` với **giá trị tham khảo** của xe chuẩn ở màn Dữ liệu xe (ADR 0090: giá
bán xe mới × khấu hao theo tuổi xe). Lệch quá ±40% ⇒ gắn cờ để vận hành gọi chủ
xe. Khai thấp làm khách mất quyền lợi khi bồi thường (MIC trả theo tỷ lệ), khai cao làm khách trả phí
oan. **Chỉ cảnh báo, không tự sửa** — chủ xe là người khai.

### 6.3 Báo cáo

Doanh số phí theo tháng, tỉ lệ cấp thành công, số GCN lỗi theo mã, số chuyến có bảo hiểm / tổng
chuyến ô tô tự lái.

### 6.4 Bồi thường

Hiện chỉ hotline MIC + GCN. Khi MIC mở API bồi thường: một hồ sơ sự cố gắn chuyến, ảnh hiện trường,
trạng thái hồ sơ phía MIC.

### 6.5 Xe máy và tai nạn người

Mở khi MIC có sản phẩm tương ứng cho XePrime; bật sản phẩm ở tab Sản phẩm + mở rộng
`insuranceEligibilityGaps`.

## ADR 0091 (16/11/2026) — chế độ của chủ xe, theo dõi hợp đồng

- **Chế độ Bắt buộc/Tuỳ chọn** do chủ xe chọn ở chính sách thuê (gian hàng theo loại xe, ghi đè theo
  xe; chủ xe tuyến hoa hồng đặt trên từng xe). Mặc định Tuỳ chọn. Xe Bắt buộc mà thiếu dữ liệu không
  nhận đặt tự lái (`VEHICLE_INSURANCE_NOT_READY`) và bị ẩn khỏi tìm xe tự lái.
- **Khối "Cần xử lý gấp"** ở đầu tab Chứng nhận (`GET /platform/money/insurance/attention`): hợp đồng
  quá 2 giờ sau giao xe chưa cấp (vòng quét API đánh dấu `escalated_at` mỗi 5 phút), và hợp đồng MIC
  hết 4 lượt tra mà vẫn chờ ảnh (`ttrang` 3). Bấm mã đơn mở đúng hợp đồng.
- **Mục "Phí bảo hiểm"** trong ngăn chi tiết (`GET /platform/money/insurance/:id/pricing`): giá trị xe,
  bậc đã áp, đã thu của khách, MIC tính lúc cấp, chênh lệch (thu dư / XePrime bù).
- **Phí thu hộ bảo hiểm** (ADR 0091 điều 3): tab Sản phẩm → sửa "Bảo hiểm vật chất xe" → khối "Phí thu hộ
  bảo hiểm": công tắc + % trên phí bảo hiểm (0-50, hai chữ số lẻ). **Mặc định tắt; KHÔNG bật ở production
  khi luật sư chưa trả lời.** Đổi % áp cho báo giá và lượt duyệt từ lúc lưu (như mọi khoản phí khác, giá chốt ở lượt duyệt); đơn và
  khoản giữ chỗ đã có giữ số đã chốt. Khách thấy gộp vào dòng bảo hiểm kèm ⓘ; ngăn
  chi tiết hợp đồng có dòng "Phí thu hộ (XePrime)"; khoản này là doanh thu XePrime, KHÔNG vào bảng kê
  chuyển MIC. Màn đối soát ba vế có dòng "Phí thu hộ bảo hiểm đã hoàn khách" (số âm) khi có lượt tự hoàn.
- **Tự hoàn khi quá giờ trả chưa cấp** (điều 7): vòng quét 5 phút tra MIC lần cuối; không có hợp đồng ⇒
  hợp đồng `cancelled`, hoàn phí bảo hiểm + phí thu hộ vào Ví điểm khách. Chỉ chạy khi khoản giữ chỗ
  của đơn đã quyết toán. Ngăn chi tiết hiện dòng "Đã tự hoàn" kèm số và giờ. Hợp đồng đã tự hoàn rời
  khối "Cần xử lý gấp"; người trực không phải hoàn tay.
