/**
 * BA CHỈ SỐ CÔNG KHAI của một gian hàng/chủ xe — định nghĩa, cửa sổ, và ngưỡng "đủ dữ liệu".
 *
 * Ba con số này là thứ khách nhìn trước khi quyết định gửi yêu cầu cho một người lạ, nên chúng
 * phải đo được, giải thích được và **không bịa**. File này giữ phần LUẬT (cửa sổ, ngưỡng, cách
 * làm mượt, phép phân loại); phép đếm thật chạy ở `HostMetricsService` — một nguồn duy nhất cho
 * mọi bề mặt (trang gian hàng, khối chủ xe ở trang xe, sổ ví, điểm xếp hạng).
 *
 * ## Một mẫu là gì
 *
 * MỘT yêu cầu thuê mà gian hàng THẬT SỰ phải quyết, trong `HOST_METRIC_WINDOW_DAYS` ngày gần
 * nhất. Ba nhóm cố ý nằm NGOÀI mẫu số, và cả ba đều vì cùng một lý do — gian hàng không có cơ
 * hội hoặc không có nghĩa vụ quyết định:
 *
 *   · `slot_taken` — hệ thống đóng vì khung giờ vừa thuộc về khách khác (ADR 0044 điều 6);
 *   · khách RÚT trước khi gian hàng quyết (`cancelled_by_customer` với `decided_at IS NULL`);
 *   · **LEGACY ADR 0039**: `hold_expired` với `decided_at IS NULL` — ở thứ tự cũ khách trả tiền
 *     trước, nên một hold hết hạn nghĩa là khách bỏ giữa đường TRƯỚC khi có ai duyệt. Suy từ
 *     status cuối sẽ tính nó thành "gian hàng đã trả lời" (sai) hoặc "không trả lời" (cũng sai).
 *
 * Yêu cầu còn `pending_host_approval` mà CHƯA quá hạn cũng chưa phải mẫu: chưa ai chậm trễ cả.
 *
 * ## Ba con số
 *
 * | Chỉ số | Tử số | Mẫu số |
 * | --- | --- | --- |
 * | Tỉ lệ phản hồi | mẫu có `decided_at IS NOT NULL` | mọi mẫu |
 * | Tỉ lệ nhận và giữ chuyến | mẫu được NHẬN và KHÔNG bị chính gian hàng huỷ | mọi mẫu |
 * | Thời gian phản hồi | — | trung vị `decided_at − created_at` của mẫu do NGƯỜI quyết |
 *
 * Bốn hệ quả đáng ghi ra vì chúng là chỗ dễ làm sai nhất:
 *
 *  1. **Từ chối trong hạn CÓ phản hồi nhưng KHÔNG phải đồng ý** — nó vào tử số thứ nhất, không
 *     vào tử số thứ hai. Một gian hàng từ chối mọi thứ có tỉ lệ phản hồi 100% và tỉ lệ nhận 0%,
 *     đúng như sự thật.
 *  2. **Không trả lời làm giảm CẢ HAI** — cùng một mẫu, hai phép chia. Đó không phải phạt đúp:
 *     phạt đúp là khi một yêu cầu sinh ra hai MẪU. Ở đây nó luôn là một.
 *  3. **Đã nhận rồi khách không trả tiền, hoặc khách tự huỷ ⇒ vẫn tính là đã đồng ý.** Gian hàng
 *     đã làm đúng phần của mình; phần còn lại không thuộc về họ.
 *  4. **Gian hàng huỷ sau khi đã nhận ⇒ mẫu đó rời tử số thứ hai, và KHÔNG sinh mẫu thứ hai.**
 *
 * ## Thời gian phản hồi chỉ đếm quyết định của NGƯỜI
 *
 * Xe bật "Đặt ngay" quyết trong vài mili-giây. Trộn nó vào trung vị sẽ quảng cáo một tốc độ trả
 * lời thủ công không có thật, nên nó được tách ra thành một nhãn riêng (`instantBook`) và không
 * vào phép tính. Một gian hàng bật "Đặt ngay" cho mọi xe vì thế hiện "Đặt ngay" thay vì một con
 * số phút — trung thực hơn, và cũng là thông tin khách cần hơn.
 */

/** Cửa sổ quan sát — 90 ngày gần nhất. Xa hơn thì nó nói về một gian hàng đã khác. */
export const HOST_METRIC_WINDOW_DAYS = 90;

/**
 * Dưới bấy nhiêu mẫu thì KHÔNG hiện phần trăm.
 *
 * **Hạ từ 5 xuống 1 ngày 23/09/2026** — đúng điều khoản "xem lại" mà ADR 0045 đã đặt sẵn cho
 * chính con số này. Lý do đổi:
 *
 *   · ở quy mô hiện tại, phần lớn chủ xe không đạt nổi 5 yêu cầu trong 90 ngày, nên ngưỡng cũ
 *     biến khối uy tín thành một dòng "chưa đủ dữ liệu" cho gần như mọi gian hàng — tức là nó
 *     không bảo vệ ai, chỉ giấu đi thứ duy nhất khách muốn đọc;
 *   · `sampleCount` luôn đi kèm con số, nên người đọc vẫn thấy được "100% trên 1 yêu cầu" khác
 *     "100% trên 200 yêu cầu";
 *   · ĐIỂM XẾP HẠNG không đọc con số đã chặn ngưỡng này — nó dùng số thô đã làm mượt Bayes
 *     (`HOST_RELIABILITY_PRIOR`), nên hạ ngưỡng hiển thị không đụng tới thứ tự tìm kiếm.
 *
 * Đánh đổi đã biết và được chấp nhận: một chủ xe bỏ lỡ đúng MỘT yêu cầu sẽ hiện "0%" công khai.
 * Con số đó đúng theo định nghĩa, nhưng nó nặng hơn nhiều so với thứ nó đo được.
 *
 * `0` mẫu thì vẫn KHÔNG có gì để nói, ở bất kỳ ngưỡng nào — `hostMetricPercent` trả `null`.
 */
export const HOST_METRIC_MIN_SAMPLES = 1;

/**
 * Prior của tỉ lệ "nhận và giữ chuyến" khi đưa vào ĐIỂM XẾP HẠNG — `(kept + w·p) / (n + w)`.
 *
 * Khác hẳn con số HIỂN THỊ: hiển thị thì thà không nói còn hơn nói sai, nhưng xếp hạng buộc phải
 * cho mọi xe một con số để so. Làm mượt là cách cho con số đó mà không bịa:
 *
 *   · chủ xe MỚI (0 mẫu) nhận đúng `priorRate` — mức nền trung tính, không phải 0% cũng không
 *     phải 100%;
 *   · MỘT sự cố đơn lẻ kéo điểm xuống nhẹ (`(0+4)/(1+5) = 0,67`), không đẩy xuống đáy;
 *   · một chuỗi dài huỷ chuyến mới kéo được điểm về gần 0 — và lúc đó nó đáng.
 */
export const HOST_RELIABILITY_PRIOR = { priorRate: 0.8, priorWeight: 5 } as const;

/** Ba trạng thái hiển thị của một chỉ số. `insufficient` KHÔNG phải 0 — xem docblock đầu file. */
export const HOST_METRIC_STATE = {
  READY: 'ready',
  INSUFFICIENT: 'insufficient',
} as const;

export type HostMetricState = (typeof HOST_METRIC_STATE)[keyof typeof HOST_METRIC_STATE];

/**
 * Ba chỉ số của một gian hàng — hình dạng dùng chung giữa API, web và app native.
 *
 * Mọi trường số đều `null` được, và `null` mang đúng một nghĩa: **chưa đủ dữ liệu để nói**. Giao
 * diện phải phân biệt được nó với 0; gộp hai thứ đó là lời nói dối rẻ tiền nhất trên trang.
 */
export interface HostMetrics {
  /** Số MẪU trong cửa sổ — luôn hiện khi chưa đủ, để "chưa đủ dữ liệu" là một câu kiểm chứng được. */
  sampleCount: number;
  /** 0–100, hoặc `null` khi `sampleCount < HOST_METRIC_MIN_SAMPLES`. */
  responseRatePercent: number | null;
  /** 0–100, hoặc `null`. Từ chối trong hạn KHÔNG nằm trong tử số này. */
  acceptKeepRatePercent: number | null;
  /** Trung vị số PHÚT tới quyết định của NGƯỜI; `null` khi chưa đủ mẫu do người quyết. */
  responseMinutesMedian: number | null;
  /** Gian hàng có ít nhất một xe bật "Đặt ngay" trong cửa sổ — hiện nhãn thay cho con số phút. */
  instantBook: boolean;
}

/** Chỉ số rỗng — gian hàng chưa có yêu cầu nào trong cửa sổ. */
export const EMPTY_HOST_METRICS: HostMetrics = {
  sampleCount: 0,
  responseRatePercent: null,
  acceptKeepRatePercent: null,
  responseMinutesMedian: null,
  instantBook: false,
};

/**
 * Đủ mẫu để hiện phần trăm chưa. MỘT phép so, dùng chung cho cả ba bề mặt.
 *
 * `minSamples` để mở vì ngưỡng là một quyết định TRÌNH BÀY, không phải một phép đo: cùng một
 * phép đếm có thể được kể lại khác nhau cho hai nhóm người đọc. Từ 23/09/2026 ngưỡng công khai
 * và ngưỡng của sổ ví cùng bằng 1, nhưng tham số vẫn để mở — nó là chỗ duy nhất đổi được con số
 * đó mà không phải sửa phép đếm ở `HostMetricsService`.
 */
export function hostMetricState(
  sampleCount: number,
  minSamples: number = HOST_METRIC_MIN_SAMPLES,
): HostMetricState {
  // Không có mẫu nào thì không có gì để nói, kể cả khi nơi gọi hạ ngưỡng xuống 0.
  if (sampleCount <= 0) return HOST_METRIC_STATE.INSUFFICIENT;
  return sampleCount >= minSamples ? HOST_METRIC_STATE.READY : HOST_METRIC_STATE.INSUFFICIENT;
}

/**
 * Phần trăm để HIỂN THỊ — `null` khi chưa đủ mẫu.
 *
 * Không làm mượt ở đây: làm mượt là để SO SÁNH (xếp hạng), còn hiển thị thì phải là con số thật
 * của chính gian hàng đó. Một gian hàng từ chối 4/10 yêu cầu phải thấy đúng 60%, không phải một
 * con số đã bị kéo về mặt bằng chung.
 */
export function hostMetricPercent(
  numerator: number,
  sampleCount: number,
  minSamples: number = HOST_METRIC_MIN_SAMPLES,
): number | null {
  if (hostMetricState(sampleCount, minSamples) !== HOST_METRIC_STATE.READY) return null;
  return Math.round((numerator / sampleCount) * 100);
}

/**
 * Điểm uy tín [0,1] để đưa vào XẾP HẠNG — luôn có giá trị, kể cả với chủ xe chưa có mẫu nào.
 *
 * Đây là chỗ duy nhất được phép "đoán": một danh sách phải xếp được mọi xe, kể cả xe của người
 * vừa mở gian hàng sáng nay. Làm mượt Bayes cho họ mức nền `priorRate` thay vì 0 hay 1.
 */
export function hostReliabilityScore(keptCount: number, sampleCount: number): number {
  const { priorRate, priorWeight } = HOST_RELIABILITY_PRIOR;
  return (keptCount + priorWeight * priorRate) / (sampleCount + priorWeight);
}

/**
 * Nhãn "nhanh thế nào" từ số phút trung vị — dải chứ không phải con số trần.
 *
 * Con số trần (“47 phút”) gợi một độ chính xác mà một trung vị trên vài chục mẫu không có. Dải
 * nói đúng thứ khách cần biết: đây là loại người trả lời trong vài phút, trong giờ, hay trong
 * ngày.
 */
export const RESPONSE_SPEED = {
  MINUTES: 'minutes',
  HOUR: 'hour',
  HOURS: 'hours',
  DAY: 'day',
} as const;

export type ResponseSpeed = (typeof RESPONSE_SPEED)[keyof typeof RESPONSE_SPEED];

export function responseSpeedOf(minutes: number | null): ResponseSpeed | null {
  if (minutes == null) return null;
  if (minutes <= 15) return RESPONSE_SPEED.MINUTES;
  if (minutes <= 60) return RESPONSE_SPEED.HOUR;
  if (minutes <= 60 * 12) return RESPONSE_SPEED.HOURS;
  return RESPONSE_SPEED.DAY;
}
