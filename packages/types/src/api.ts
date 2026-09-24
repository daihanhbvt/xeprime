/**
 * Convention response của API — CLAUDE.md mục 9.
 *
 * Các type này được dùng ở CẢ HAI phía. Backend khai báo generic DTO tương ứng có
 * `@ApiProperty` để `@nestjs/swagger` sinh đúng lớp bọc; nếu quên, OpenAPI spec sẽ mất
 * `{ data }` và type FE sinh ra sẽ sai (ADR 0007).
 */

export interface ApiMeta {
  [key: string]: unknown;
}

export interface PaginationMeta extends ApiMeta {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface ApiSuccess<TData, TMeta extends ApiMeta = ApiMeta> {
  data: TData;
  meta?: TMeta;
}

export type ApiPaginated<TItem> = ApiSuccess<TItem[], PaginationMeta>;

export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  details?: unknown;
}

export interface ApiError {
  error: ApiErrorBody;
}

/**
 * Mã lỗi ổn định. Frontend nhánh theo `code`, KHÔNG nhánh theo `message` — message có thể
 * đổi cách diễn đạt bất cứ lúc nào.
 */
export const API_ERROR_CODE = {
  // Auth / session (ADR 0002)
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  // Đăng nhập/đăng ký bằng định danh + mật khẩu
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  PHONE_TAKEN: 'PHONE_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /*
   * Đổi mật khẩu khi ĐÃ đăng nhập (`POST /auth/password/change`).
   *
   * Cố ý KHÔNG dùng lại `INVALID_CREDENTIALS`: mã đó đi kèm 401 và web coi 401 là "phiên hỏng"
   * ở nhiều chỗ — người gõ sai mật khẩu cũ không được bị đá ra khỏi tài khoản.
   */
  /** Mật khẩu hiện tại không đúng. */
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  /** Tài khoản chưa có mật khẩu — dùng `POST /auth/password/set` (đặt lần đầu) thay vì đổi. */
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',
  /** Mật khẩu mới trùng mật khẩu hiện tại. */
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',

  /*
   * Đăng nhập mạng xã hội — ADR 0019.
   *
   * Bốn mã này KHÔNG bao giờ đi trong một response JSON: cả hai route `/auth/social/*` là
   * điều hướng trình duyệt, nên chúng về web dưới dạng `?authError=<mã>` và web tra bảng chữ
   * đúng như với mọi mã lỗi khác (ADR 0012 — dịch từ MÃ, không hiện `message` của backend).
   */
  /** Provider chưa có client id/secret trong env — nút vẫn hiện, bấm vào thì báo mã này. */
  SOCIAL_NOT_CONFIGURED: 'SOCIAL_NOT_CONFIGURED',
  /**
   * `state` sai, đã hết hạn, hoặc đã dùng rồi.
   *
   * Gộp ba nguyên nhân vào MỘT mã là cố ý: phân biệt "sai" với "đã dùng" cho kẻ tấn công biết
   * mình đoán trúng một `state` có thật. Với người dùng thật thì lối đi tiếp giống hệt nhau —
   * bấm đăng nhập lại.
   */
  SOCIAL_STATE_INVALID: 'SOCIAL_STATE_INVALID',
  /** Người dùng bấm huỷ ở màn đồng ý của provider (`error=access_denied`). Không phải sự cố. */
  SOCIAL_CANCELLED: 'SOCIAL_CANCELLED',
  /** Đổi code thất bại, `debug_token` không khớp app, hoặc `id_token` không hợp lệ. */
  SOCIAL_EXCHANGE_FAILED: 'SOCIAL_EXCHANGE_FAILED',

  /*
   * Thư mời vào gian hàng (R1 — thay cho việc thêm thẳng người vào tenant).
   *
   * Bốn mã riêng thay vì `NOT_FOUND`/`CONFLICT` chung, vì bốn lối đi tiếp khác hẳn nhau và
   * người đọc màn hình mời là người NGOÀI gian hàng — họ không có gì để tự suy ra.
   */
  /** Token không tồn tại, đã dùng, đã bị thu hồi, hoặc đã bị chính người nhận từ chối. */
  INVITE_INVALID: 'INVITE_INVALID',
  /** Còn đúng nhưng quá `expires_at`. Việc cần làm là xin gian hàng gửi lại, không phải thử lại. */
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  /**
   * Đang đăng nhập bằng một tài khoản KHÁC với email được mời.
   *
   * Không tự nhận lời mời cho tài khoản đang đăng nhập: link mời đi qua email/chat và có thể
   * bị chuyển tiếp, nên "ai cầm link thì vào được" là một cách chiếm chỗ trong gian hàng người
   * khác. `details` mang `{ invitedEmail }` đã che bớt để người dùng biết cần đăng nhập bằng
   * hộp thư nào mà không lộ nguyên địa chỉ cho người cầm link nhầm.
   */
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
  /** Đã là thành viên đang hoạt động của chính gian hàng này — lời mời không còn việc gì để làm. */
  INVITE_ALREADY_MEMBER: 'INVITE_ALREADY_MEMBER',

  // Phân quyền
  FORBIDDEN: 'FORBIDDEN',
  MISSING_PERMISSION: 'MISSING_PERMISSION',
  NO_TENANT_SCOPE: 'NO_TENANT_SCOPE',
  TENANT_NOT_ACTIVE: 'TENANT_NOT_ACTIVE',

  // Dữ liệu
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Nghiệp vụ lịch (ADR 0006)
  BOOKING_SCHEDULE_CONFLICT: 'BOOKING_SCHEDULE_CONFLICT',
  /**
   * Sửa một trường bị khoá của xe ĐANG công khai (biển số, loại xe, hộp số, nhiên liệu, năm sản
   * xuất). Mã riêng thay vì `VALIDATION_FAILED`: giá trị gửi lên hợp lệ, thứ sai là thời điểm —
   * FE dùng mã này để chỉ đúng ô bị khoá và mời gỡ xe khỏi chợ nếu thật sự cần đổi.
   */
  VEHICLE_FIELD_LOCKED: 'VEHICLE_FIELD_LOCKED',
  /**
   * Đã có một yêu cầu thuê y hệt (cùng xe + SĐT + khung giờ) đang chờ shop phản hồi.
   * Mã riêng thay vì `CONFLICT` chung: FE hiện hộp "Yêu cầu trùng lặp" có lối đi tiếp
   * (xem chuyến / nhắn chủ xe), khác hẳn một alert lỗi thường.
   */
  BOOKING_REQUEST_DUPLICATE: 'BOOKING_REQUEST_DUPLICATE',
  /**
   * Yêu cầu đã quá **hạn phản hồi 60 phút** — không duyệt và không từ chối được nữa.
   *
   * Mã riêng thay vì `INVALID_STATUS_TRANSITION`: trạng thái trong DB có thể vẫn còn
   * `pending_host_approval` (worker chạy theo nhịp, không tức thời), nên câu "yêu cầu này đã
   * được xử lý" là sai và gây hoang mang. Điều cần nói là "hết giờ rồi" — và việc cần làm là
   * gọi cho khách, không phải bấm lại.
   */
  BOOKING_REQUEST_EXPIRED: 'BOOKING_REQUEST_EXPIRED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /**
   * Ghi nhận khách không đến quá sớm — chưa qua ân hạn `BOOKING_NO_SHOW_GRACE_MINUTES` kể từ
   * giờ nhận theo đơn, hoặc xe đã thực sự được giao (đã có biên bản giao xe).
   *
   * Mã riêng vì hai lối đi tiếp khác nhau hẳn: chưa tới giờ thì CHỜ, còn đã giao xe rồi thì
   * chuyến đang chạy và việc cần làm là nhận lại xe.
   */
  BOOKING_NO_SHOW_NOT_ALLOWED: 'BOOKING_NO_SHOW_NOT_ALLOWED',
  /**
   * ĐÃ NGHỈ HƯU (Wave 9) — **không endpoint nào còn trả mã này**.
   *
   * Trước đây: yêu cầu có giao tận nơi mà chưa báo giá thì không duyệt được. Vòng báo giá đã bị
   * bỏ; giao nhận miễn phí lúc duyệt và chủ xe chốt phí trên đơn sau khi thoả thuận với khách.
   * Giữ khoá lại để log/audit cũ vẫn đọc được — đừng ném lại mã này.
   */
  DELIVERY_QUOTE_REQUIRED: 'DELIVERY_QUOTE_REQUIRED',
  /** Khách yêu cầu giao tận nơi nhưng chính sách hiệu lực của xe không bật giao nhận. */
  DELIVERY_NOT_SUPPORTED: 'DELIVERY_NOT_SUPPORTED',
  /**
   * Giờ nhận/trả nằm ngoài khung giờ giao nhận chủ xe đã đặt cho xe (08/09/2026). Server kiểm
   * khi khách gửi yêu cầu và khi gian hàng chốt giờ nhận dài hạn — FE chỉ là preview.
   */
  HANDOVER_WINDOW_VIOLATION: 'HANDOVER_WINDOW_VIOLATION',
  /** Chủ xe bắt buộc khách đồng ý điều khoản trước khi gửi yêu cầu mà payload chưa tích. */
  RENTAL_TERMS_ACCEPTANCE_REQUIRED: 'RENTAL_TERMS_ACCEPTANCE_REQUIRED',
  /** Thời lượng thuê ngắn hơn mức tối thiểu chủ xe đặt cho dịch vụ có tài xế. */
  MIN_RENTAL_DURATION: 'MIN_RENTAL_DURATION',
  /**
   * Khách bấm huỷ chuyến ở chặng không còn huỷ được (xe đã giao, chuyến đã xong, hoặc yêu cầu
   * đã bị từ chối/huỷ trước đó).
   *
   * Mã riêng thay vì `CONFLICT` chung để FE nói đúng lối đi tiếp — sau khi đã nhận xe thì việc
   * cần làm là liên hệ chủ xe, không phải thử lại.
   */
  TRIP_CANCEL_NOT_ALLOWED: 'TRIP_CANCEL_NOT_ALLOWED',
  /**
   * Đơn đã có một khoản phát sinh còn hiệu lực ở danh mục CHỈ ĐƯỢC GHI MỘT LẦN (hiện là phí
   * vượt km). `details` mang `{ category, surchargeId }` để FE chỉ thẳng vào khoản đang có.
   *
   * Mỗi chuyến chỉ có một cặp chỉ số đồng hồ, nên "vượt km" là một con số duy nhất: ghi lần thứ
   * hai là trừ tiền khách hai lần cho cùng một quãng đường. Sửa số thì sửa khoản đang có, gỡ
   * rồi ghi lại cũng được — nhưng phải là một hành động tường minh, không phải một cú bấm nữa.
   */
  SURCHARGE_CATEGORY_DUPLICATE: 'SURCHARGE_CATEGORY_DUPLICATE',

  // Gói/hạn (ADR 0010 · tách theo loại xe từ ADR 0015 điều 7)
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  /**
   * ĐÃ NGHỈ HƯU (ADR 0029) — **không endpoint nào còn trả mã này**.
   *
   * Trước đây: bậc gói `package` vi phạm kiểm điểm giao của ADR 0020 (phí nền quá thấp so với
   * tuyến hoa hồng). ADR 0029 chuyển phí theo chuyến sang PHÍA KHÁCH nên phép kiểm mất cơ sở
   * và đã bị gỡ. Giữ khoá để log/audit cũ vẫn đọc được — đừng ném lại mã này.
   */
  PLAN_INCENTIVE_INVALID: 'PLAN_INCENTIVE_INVALID',

  /**
   * Danh mục gói đã có một bậc TUYẾN HOA HỒNG và không được phép có bậc thứ hai.
   *
   * Tuyến hoa hồng là một TUYẾN, không phải một dòng sản phẩm: mọi chủ xe cá nhân vào cửa bằng
   * đúng một bậc, và `assignDefaultPlanWithinTx` / job vòng đời đều chọn "bậc commission có
   * `sort_order` nhỏ nhất". Bậc thứ hai biến phép chọn đó thành một cuộc xổ số — hai chủ xe mở
   * gian hàng cùng ngày có thể nhận hai % phí dịch vụ khác nhau mà không ai quyết định điều đó.
   */
  COMMISSION_PLAN_IS_SINGLETON: 'COMMISSION_PLAN_IS_SINGLETON',
  /**
   * Bậc gói này bán bằng TƯ VẤN — gian hàng không tự mua được (ADR 0041 điều 5).
   *
   * `details` mang `{ planCode }`. Không phải `FORBIDDEN` cũng không phải `VALIDATION_FAILED`:
   * người gọi có thừa quyền và dữ liệu họ gửi hoàn toàn hợp lệ — chỉ là bậc doanh nghiệp không
   * có giá niêm yết để tự thanh toán. Thẻ của nó VẪN hiện trên bảng giá (với nút "Liên hệ tư
   * vấn") vì giấu hẳn nó là giấu luôn lối nâng cấp của gian hàng lớn nhất, nên đường POST gọi
   * được và mã lỗi phải nói đúng việc cần làm.
   */
  PLAN_NOT_SELF_SERVE: 'PLAN_NOT_SELF_SERVE',
  /**
   * Thao tác sẽ làm HỎNG bậc gói mặc định của tuyến hoa hồng (archive nó, hoặc đổi nó sang
   * `package`).
   *
   * `details` mang `{ planCode, operation }`. Không phải `FORBIDDEN`: người gọi có thừa quyền,
   * chính THAO TÁC mới là thứ bị cấm — gỡ bậc đó đi là gỡ luôn tuyến vào cửa của toàn sàn, và
   * triệu chứng không hiện ra ở màn quản trị gói mà ở chỗ khác hẳn: mọi gian hàng mở sau đó
   * không có tuyến thu phí.
   */
  DEFAULT_PLAN_PROTECTED: 'DEFAULT_PLAN_PROTECTED',
  /**
   * KHÔNG có bậc gói tuyến hoa hồng nào đang bán — không mở được gian hàng mới.
   *
   * Ném thay vì ghi log rồi tạo tenant không gói: một tenant không có dòng thuê bao nào là pha
   * `unconfigured` (ADR 0038 điều 1), tức là mọi đường ghi tiền của họ bị từ chối về sau. Thất
   * bại ngay lúc đăng ký nhìn thấy được và sửa được; thất bại lặng lẽ thì người dùng chỉ phát
   * hiện khi khách đầu tiên bấm đặt xe.
   */
  DEFAULT_COMMISSION_PLAN_MISSING: 'DEFAULT_COMMISSION_PLAN_MISSING',

  // Năng lực theo gói (ADR 0027) — TRỤC THỨ HAI, độc lập với MISSING_PERMISSION.
  /**
   * Gian hàng KHÔNG có tính năng này trong gói hiện hành và cũng chưa từng dùng nó
   * (`hidden` — ADR 0027 điều 3). Người dùng không thiếu quyền; GIAN HÀNG thiếu tính năng, nên
   * lối đi tiếp là xem gói chứ không phải liên hệ quản trị viên.
   *
   * `details` mang `{ feature }`. Trả **403**, không phải 402: toàn bộ máy sinh tài liệu và
   * `openapi-contract` coi 403 là nhánh phân quyền, và 402 bị proxy xử lý mỗi nơi một kiểu.
   */
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  /**
   * Gói hết hạn nhưng gian hàng ĐÃ CÓ dữ liệu của tính năng này (`read_only` — ADR 0027 điều 3):
   * mọi endpoint ĐỌC vẫn trả dữ liệu bình thường, chỉ đường GHI bị chặn.
   *
   * `details` mang `{ feature, planEndsAt }` để FE hiện đúng mốc hết hạn kèm nút gia hạn.
   * Không ai được mất quyền XEM sổ sách của chính mình vì hết hạn gói.
   */
  FEATURE_READ_ONLY: 'FEATURE_READ_ONLY',

  // Khoản giữ chỗ — tuyến hoa hồng (ADR 0021)
  /**
   * Xe này ở tuyến hoa hồng: phải chuyển khoản giữ chỗ trước khi có đơn.
   *
   * Không phải lỗi của người dùng — nó là tín hiệu để FE mở bước VietQR. Ném khi có ai đó đi
   * đường tắt tới bước sau mà chưa qua bước tiền.
   */
  HOLD_REQUIRED: 'HOLD_REQUIRED',
  /** Quá cửa sổ chuyển khoản, chỗ đã nhả. Lối đi tiếp là đặt lại, không phải thử lại. */
  HOLD_EXPIRED: 'HOLD_EXPIRED',
  /** Khoản giữ chỗ này đã nhận đủ tiền rồi — chặn tạo đơn lần hai từ cùng một hold. */
  HOLD_ALREADY_PAID: 'HOLD_ALREADY_PAID',
  /**
   * Đã qua mốc huỷ miễn phí (`freeCancelUntil`) nên khoản giữ chỗ không hoàn.
   *
   * `details` mang `{ freeCancelUntil }` để FE nói đúng mốc đã qua thay vì một câu chung chung.
   */
  HOLD_NOT_REFUNDABLE: 'HOLD_NOT_REFUNDABLE',
  /**
   * Chuyến này không đặt-ngay được, phải đi luồng gửi yêu cầu (ADR 0021 điều 8).
   *
   * Hai nguyên nhân, cả hai đều là "không lấy % của một con số chưa chốt": thuê dài hạn chưa có
   * giờ nhận (ADR 0011), hoặc báo giá còn là tạm tính (`estimateNote`).
   * `details` mang `{ reason }`.
   */
  INSTANT_BOOK_UNAVAILABLE: 'INSTANT_BOOK_UNAVAILABLE',
  /** Hold không ở trạng thái chờ tiền — đã trả, đã hết hạn hoặc đã huỷ. `details` mang `{ status }`. */
  HOLD_NOT_PENDING: 'HOLD_NOT_PENDING',
  /**
   * Giờ nhận xe quá gần để kịp thu tiền giữ chỗ — ADR 0044 điều 4.
   *
   * Hạn chuyển tiền bị kẹp bởi `pickupAt`, và phần còn lại đã ngắn hơn
   * `HOLD_MIN_USABLE_WINDOW_MINUTES`. Ném khi gian hàng bấm duyệt (hoặc lúc hệ thống định tự
   * nhận) một chuyến sát giờ: phát một mã QR chắc chắn hết hạn trước khi khách mở nổi app ngân
   * hàng là khoá xe vô nghĩa rồi bắt cả hai bên chờ.
   *
   * Không phải lỗi dữ liệu của người bấm — nó là một câu trả lời: chuyến này phải thoả thuận
   * trực tiếp với khách. `details` mang `{ pickupAt, minWindowMinutes }`.
   */
  HOLD_WINDOW_TOO_SHORT: 'HOLD_WINDOW_TOO_SHORT',

  /**
   * Khách đang giữ quá nhiều chỗ chưa thanh toán — `HOLD_MAX_OPEN_PER_CUSTOMER` (ADR 0044).
   *
   * Ném khi một lượt DUYỆT định sinh khoản giữ chỗ thứ tư cho cùng một khách. Chặn ở đường
   * DUYỆT chứ không ở đường gửi yêu cầu là có chủ đích: gửi yêu cầu không khoá xe của ai, nên
   * chặn ở đó là chặn nhầm người. `details` mang `{ openHolds, limit }`.
   */
  HOLD_LIMIT_REACHED: 'HOLD_LIMIT_REACHED',

  // Mã khuyến mãi nền tảng (ADR 0046)
  /**
   * Mã khuyến mãi không áp được cho chuyến này — `details.reason` là một `PromoIneligibleReason`
   * và đó là thứ giao diện ánh xạ thành câu chữ (ADR 0012: dịch từ MÃ, không hiện `message`).
   *
   * MỘT mã lỗi cho mười hai lý do là chủ đích: web/mobile chỉ cần một nhánh xử lý, và danh sách
   * lý do còn mọc thêm khi chiến dịch có thêm điều kiện. `details` cũng mang `code` (mã đã chuẩn
   * hoá) để giao diện nói đúng mã khách vừa gõ, kể cả khi họ gõ chữ thường.
   *
   * Ném ở CẢ BA cửa kiểm: xem trước, gửi yêu cầu, và chốt giá lúc duyệt.
   */
  PROMO_CODE_NOT_APPLICABLE: 'PROMO_CODE_NOT_APPLICABLE',
  /**
   * Mã đã hết lượt đúng lúc khách bấm gửi — cuộc đua ở slot cuối, và bên thua nhận mã này.
   *
   * Tách khỏi `PROMO_CODE_NOT_APPLICABLE` vì nó cần một câu chữ khác: khách vừa thấy mã còn hiệu
   * lực ở bước xem trước, nên câu trả lời phải nói rõ là vừa có người dùng hết, không nói rằng
   * họ không đủ điều kiện.
   */
  PROMO_CODE_EXHAUSTED: 'PROMO_CODE_EXHAUSTED',
  /** Mã đã tồn tại (unique `code` sau chuẩn hoá) — admin tạo/nhân bản trùng. */
  PROMO_CODE_DUPLICATE: 'PROMO_CODE_DUPLICATE',
  /**
   * Admin sửa một trường đã BỊ KHOÁ sau khi chiến dịch phát sinh lượt dùng
   * (`PROMO_LOCKED_FIELDS_AFTER_USE` — ADR 0046 điều 8). `details.fields` liệt kê tên trường.
   */
  PROMO_CODE_LOCKED: 'PROMO_CODE_LOCKED',
  /**
   * Chuyến này không ở chặng huỷ được — `details` mang `{ stage }`.
   *
   * Khác `INVALID_STATUS_TRANSITION`: kia nói về máy trạng thái của ĐƠN, còn đây trả lời câu
   * hỏi nghiệp vụ "gian hàng có được rút lại chuyến này không" — và câu trả lời phụ thuộc chặng
   * (đã bàn giao thì phải đi quyết toán, đã kết thúc thì chỉ còn lịch sử).
   */
  BOOKING_CANCEL_NOT_ALLOWED: 'BOOKING_CANCEL_NOT_ALLOWED',
  /** Khoản giữ chỗ đang bị TẠM GIỮ vì có tranh chấp mở — không chốt kết cục được (R3). */
  HOLD_LOCKED_BY_DISPUTE: 'HOLD_LOCKED_BY_DISPUTE',
  /**
   * Gian hàng ở tuyến HOA HỒNG — cọc là bắt buộc và không có công tắc để tắt (ADR 0032 điều 2).
   *
   * Trả **403** cho `PATCH /shop/payment-settings`. Màn hình vẫn HIỆN công tắc ở trạng thái bật
   * + khoá kèm giải thích (ADR 0027 điều 4: ẩn nút chỉ là trang trí), nên mã này là thứ chặn
   * thật khi có ai gọi thẳng API.
   */
  DEPOSIT_ALWAYS_REQUIRED: 'DEPOSIT_ALWAYS_REQUIRED',

  // Chính sách phí (R3 — ADR 0028/0029)
  /** Không có chính sách phí nào đang hiệu lực — lỗi CẤU HÌNH, chặn tạo hold. */
  FEE_POLICY_MISSING: 'FEE_POLICY_MISSING',
  /** Chỉ bản nháp mới sửa/kích hoạt được. */
  FEE_POLICY_NOT_DRAFT: 'FEE_POLICY_NOT_DRAFT',
  /**
   * Bản chính sách không đủ điều kiện kích hoạt (ADR 0028 điều 4–5): bật thuế/bảo hiểm mà chưa
   * có căn cứ thật. `details` mang `{ blockers: string[] }` — khoá của `feePolicyActivationBlockers`.
   */
  FEE_POLICY_ACTIVATION_BLOCKED: 'FEE_POLICY_ACTIVATION_BLOCKED',

  // Hoàn khoản giữ chỗ (R3)
  /** Yêu cầu hoàn đã được xử lý (paid/rejected) — không đổi được nữa. */
  REFUND_ALREADY_HANDLED: 'REFUND_ALREADY_HANDLED',
  /** Chưa có tài khoản nhận hoàn — khách phải khai trước khi hoàn được ghi nhận. */
  REFUND_ACCOUNT_REQUIRED: 'REFUND_ACCOUNT_REQUIRED',

  // Tài khoản ngân hàng nhận tiền (ADR 0033)
  /** Số tài khoản này đã có trong danh sách đang dùng của chính chủ đó. */
  BANK_ACCOUNT_DUPLICATE: 'BANK_ACCOUNT_DUPLICATE',

  // Rút tiền (ADR 0033)
  /** Số dư khả dụng không đủ, hoặc ví đang tạm khoá. */
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  /** Dưới mức rút tối thiểu — `details.minAmount` mang con số để FE nói đúng số. */
  WITHDRAWAL_BELOW_MINIMUM: 'WITHDRAWAL_BELOW_MINIMUM',
  /** Yêu cầu rút đã được duyệt/chi/từ chối — không đổi được nữa. */
  WITHDRAWAL_ALREADY_HANDLED: 'WITHDRAWAL_ALREADY_HANDLED',

  // Hồ sơ người bán (R3)
  /** Hồ sơ ở trạng thái không cho sửa/gửi (đang chờ xác minh). `details` mang `{ status }`. */
  SELLER_PROFILE_NOT_EDITABLE: 'SELLER_PROFILE_NOT_EDITABLE',
  /** Thiếu trường bắt buộc để gửi xác minh. `details` mang `{ missing: string[] }`. */
  SELLER_PROFILE_INCOMPLETE: 'SELLER_PROFILE_INCOMPLETE',

  // Support case (R3)
  /** Case đã đóng — mở case mới thay vì viết tiếp. */
  SUPPORT_CASE_CLOSED: 'SUPPORT_CASE_CLOSED',
  /**
   * Loại case này chỉ do CHÍNH người dùng mở cho tài khoản của mình (`account_deletion`) —
   * gian hàng/nền tảng không mở hộ, và không gắn đơn thuê.
   */
  SUPPORT_CASE_CATEGORY_NOT_ALLOWED: 'SUPPORT_CASE_CATEGORY_NOT_ALLOWED',

  // Ví (ADR 0023)
  /** Số dư khả dụng không đủ cho yêu cầu rút (đã trừ phần đang bị khoá bởi yêu cầu chờ duyệt). */
  WALLET_INSUFFICIENT_BALANCE: 'WALLET_INSUFFICIENT_BALANCE',

  // Đối soát ngân hàng (ADR 0022)
  /**
   * Webhook SePay sai khoá API. Trả 401 và KHÔNG kèm chi tiết nào —
   * đây là endpoint công khai duy nhất có quyền ghi tiền.
   */
  SEPAY_SIGNATURE_INVALID: 'SEPAY_SIGNATURE_INVALID',
  /**
   * Nhóm biến SEPAY_* chưa khai — webhook trả 503 fail-closed thay vì nhận tiền mà không có
   * khoá để kiểm. SePay sẽ retry, và đó là hành vi đúng: tiền không mất, chỉ chờ cấu hình.
   */
  SEPAY_NOT_CONFIGURED: 'SEPAY_NOT_CONFIGURED',
  /**
   * Giao dịch ngân hàng này KHÔNG còn ở trạng thái chờ xử lý — ai đó vừa khớp/bỏ qua nó, hoặc
   * webhook đã tự khớp xong. Ném khi admin bấm khớp tay trên một dòng đã được xử lý.
   *
   * Lối đi tiếp là TẢI LẠI danh sách, không phải thử lại: trạng thái đã đổi thật.
   */
  BANK_TX_ALREADY_HANDLED: 'BANK_TX_ALREADY_HANDLED',
  /**
   * Hoá đơn admin chọn để khớp tay không còn nhận tiền được (`void` / `draft`).
   *
   * Mã riêng vì lối đi tiếp rất cụ thể: bảo gian hàng tạo lại hoá đơn rồi khớp vào mã mới —
   * KHÔNG mở lại một hoá đơn đã chết, vì kỳ và giá của nó có thể đã cũ. `details` mang
   * `{ invoiceStatus }`.
   */
  BANK_TX_TARGET_NOT_PAYABLE: 'BANK_TX_TARGET_NOT_PAYABLE',

  // Sổ Thu-Chi (Phase 6 · epic nối tiền)
  /**
   * Phiếu sinh TỰ ĐỘNG từ một nghiệp vụ — không huỷ trực tiếp được.
   *
   * Huỷ thẳng phiếu thu của một lần thu tiền làm sổ báo ít hơn thực tế trong khi đơn vẫn ghi đã
   * thu. Đảo phải đi qua chính nghiệp vụ gốc (hoàn giao dịch / sửa bản ghi hoàn cọc / sửa phiếu
   * bảo dưỡng). `details` mang `{ source, sourceRefId, bookingId }` để FE dựng đúng đường quay về.
   */
  RECEIPT_SOURCE_LOCKED: 'RECEIPT_SOURCE_LOCKED',
  /**
   * Phiếu tay gửi lên gắn CẢ đơn thuê lẫn xe, nhưng đơn đó không chạy chiếc xe đó.
   *
   * Mã riêng thay vì `VALIDATION_FAILED`: hai ô đều hợp lệ khi xét riêng, thứ sai là quan hệ
   * giữa chúng — nên câu trả lời đúng cho người dùng là "bỏ chọn một trong hai", không phải
   * "dữ liệu chưa hợp lệ". Ghi sai cặp này làm sổ theo xe và sổ theo đơn kể hai câu chuyện
   * khác nhau về cùng một khoản tiền.
   */
  RECEIPT_BOOKING_VEHICLE_MISMATCH: 'RECEIPT_BOOKING_VEHICLE_MISMATCH',

  // Xác thực SĐT / OTP (Phase 4)
  PHONE_NOT_VERIFIED: 'PHONE_NOT_VERIFIED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_TOO_MANY: 'OTP_TOO_MANY',
  /** Nhập sai mã quá số lần cho phép — mã bị khoá, phải gửi lại mã mới. */
  OTP_LOCKED: 'OTP_LOCKED',

  // OCR giấy tờ xe (Wave 5)
  /** Chưa cấu hình nhà cung cấp OCR — trích xuất tự động không khả dụng, mời nhập tay. */
  OCR_NOT_CONFIGURED: 'OCR_NOT_CONFIGURED',
  /** Đang có job OCR chạy trên phiên bản này — không tạo job trùng. */
  OCR_PROCESSING: 'OCR_PROCESSING',
  /** Ảnh mờ/không đúng định dạng — không trích xuất được, mời nhập tay hoặc tải ảnh khác. */
  OCR_UNREADABLE: 'OCR_UNREADABLE',
  OCR_FAILED: 'OCR_FAILED',

  // Bảo dưỡng & KM (Wave 6)
  /**
   * KM mới thấp hơn KM hiện tại. Mã riêng thay vì `VALIDATION_FAILED` vì FE có lối đi tiếp
   * hẳn hoi: người đủ quyền cao thấy hộp xác nhận giảm KM kèm lý do, người không đủ quyền
   * thấy hướng dẫn xin phê duyệt — không phải một alert lỗi thường.
   */
  ODOMETER_DECREASE_FORBIDDEN: 'ODOMETER_DECREASE_FORBIDDEN',

  // Bàn giao xe (Wave 7)
  /**
   * KM trả nhỏ hơn KM lúc giao. Mã riêng vì FE hiển thị được CHÍNH mốc phải vượt qua
   * (`details.pickupKm`) ngay tại ô nhập, thay vì một dòng "dữ liệu không hợp lệ".
   */
  HANDOVER_ODOMETER_BELOW_PICKUP: 'HANDOVER_ODOMETER_BELOW_PICKUP',
  /**
   * Quãng đường phát sinh thấp bất thường so với ngưỡng gian hàng cấu hình. KHÔNG phải lỗi:
   * người vận hành có thể xác nhận "vẫn đúng" và gửi lại kèm `acknowledgeSuspicious`.
   */
  HANDOVER_ODOMETER_SUSPICIOUS: 'HANDOVER_ODOMETER_SUSPICIOUS',
  /**
   * Đơn không còn ở trạng thái mở được chiều bàn giao này (đã hủy, đã hoàn thành, hoặc
   * người khác vừa xác nhận). FE tải lại đơn thay vì hiện lỗi chung.
   */
  HANDOVER_NOT_ELIGIBLE: 'HANDOVER_NOT_ELIGIBLE',

  // Sổ khách của gian hàng (S-01)
  /**
   * SĐT đã thuộc một khách khác TRONG CÙNG gian hàng (so trên dạng đã chuẩn hoá, nên `09…` và
   * `+849…` là trùng). Mã riêng vì FE có lối đi tiếp hẳn hoi: mở hồ sơ đang giữ số đó
   * (`details.customerId`), chứ không phải một alert lỗi thường. TUYỆT ĐỐI không tự gộp hai hồ
   * sơ — gộp khách là việc có chủ đích, không phải hệ quả phụ của một lần sửa SĐT.
   */
  CUSTOMER_PHONE_DUPLICATE: 'CUSTOMER_PHONE_DUPLICATE',
  /** Hồ sơ khách đã lưu trữ — khôi phục trước khi sửa / ghi chú / gắn giấy tờ. */
  CUSTOMER_ARCHIVED: 'CUSTOMER_ARCHIVED',
  /**
   * Gian hàng đã đánh dấu khách này là "từ chối phục vụ".
   *
   * Mã này chỉ tới được NGƯỜI TRONG SHOP (lập đơn tại quầy, duyệt yêu cầu). Đường công khai
   * (khách gửi yêu cầu từ Marketplace) KHÔNG bao giờ trả mã này — nó trả `CONFLICT` kèm thông
   * điệp trung tính, vì khách không được biết mình nằm trong danh sách nội bộ nào.
   */
  CUSTOMER_BLOCKED: 'CUSTOMER_BLOCKED',

  // Chat (ADR 0009)
  /**
   * Khách của yêu cầu/đơn này KHÔNG có tài khoản trên nền tảng (khách vãng lai gửi yêu cầu
   * bằng SĐT đã xác thực OTP, chưa từng đăng nhập). Không có tài khoản thì không có phía bên
   * kia để mở hội thoại — gian hàng phải gọi điện hoặc nhắn Zalo.
   *
   * Mã riêng thay vì `NOT_FOUND`: đây KHÔNG phải lỗi tra cứu mà là một sự thật về dữ liệu, và
   * FE dùng nó để vô hiệu hoá nút "Nhắn tin" kèm lời giải thích thay vì hiện một alert lỗi.
   */
  CHAT_CUSTOMER_UNAVAILABLE: 'CHAT_CUSTOMER_UNAVAILABLE',

  /**
   * Khách muốn nhắn cho một CHỦ XE CÁ NHÂN (tuyến hoa hồng) mà chưa từng gửi yêu cầu thuê nào
   * cho họ. Kênh chat của tuyến hoa hồng mở SAU yêu cầu, không mở sẵn — xem
   * `storefrontAllowsPublicChat`.
   *
   * 403 chứ không 404: gian hàng có thật và khách nhìn thấy nó, chỉ là chưa tới lúc mở kênh.
   * FE dùng mã này để giải thích bước tiếp theo ("gửi yêu cầu thuê trước"), không hiện alert lỗi.
   */
  CHAT_REQUIRES_BOOKING: 'CHAT_REQUIRES_BOOKING',

  /**
   * Chi nhánh còn ràng buộc nên chưa ngừng/đổi được: `details` liệt kê CHÍNH XÁC cái gì đang
   * giữ nó (số xe, số đơn đang chạy/sắp tới) để người dùng biết phải chuyển gì trước.
   */
  BRANCH_HAS_DEPENDENCIES: 'BRANCH_HAS_DEPENDENCIES',
  /** Chi nhánh mặc định không được ngừng hoạt động — gian hàng luôn phải có một nơi nhận xe. */
  BRANCH_DEFAULT_IMMUTABLE: 'BRANCH_DEFAULT_IMMUTABLE',
  /** Xe/chi nhánh chưa có tỉnh hợp lệ nên không thể đưa lên marketplace. */
  BRANCH_LOCATION_REQUIRED: 'BRANCH_LOCATION_REQUIRED',

  // Duyệt hồ sơ gian hàng
  /**
   * Hồ sơ gian hàng còn thiếu thông tin BẮT BUỘC nên chưa gửi duyệt được
   * (`missingShopProfileRequirements` ở `shop-profile.ts` là quy tắc dùng chung hai phía).
   *
   * Mã riêng thay vì `VALIDATION_FAILED`: `details.missing[]` mang đúng danh sách khoá
   * `SHOP_PROFILE_REQUIREMENT`, nên FE chỉ thẳng vào ô còn trống thay vì hiện một dòng "dữ liệu
   * chưa hợp lệ" rồi để người dùng tự đi tìm.
   */
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  /**
   * Gian hàng trả phí CHƯA hoàn tất onboarding: đã tạo hồ sơ nhưng chưa thanh toán gói đầu tiên
   * (`tenants.onboarding_state = 'package_pending'` — ADR 0040).
   *
   * Mã riêng, không dùng `SUBSCRIPTION_TRACK_ONLY`: hai tình huống trông giống nhau ở backend
   * (không có thuê bao tuyến gói hiệu lực) nhưng lối đi tiếp NGƯỢC nhau. `SUBSCRIPTION_TRACK_ONLY`
   * nói "khu này không dành cho bạn, về Owner Lite"; mã này nói "khu này LÀ của bạn, chuyển nốt
   * tiền đi" — và đưa một người đang chờ đối soát về Owner Lite là đúng lỗi mà ADR 0040 sửa.
   */
  PACKAGE_ONBOARDING_INCOMPLETE: 'PACKAGE_ONBOARDING_INCOMPLETE',
  /**
   * Hồ sơ GIAN HÀNG TUYẾN GÓI chưa đủ để gửi xe lên chợ (ADR 0040 điều 7).
   * `details.missing[]` mang khoá `PACKAGE_SHOP_LISTING_REQUIREMENT`.
   *
   * Mã RIÊNG, không dùng chung `PROFILE_INCOMPLETE` ở trên — dù cả hai đều nói "hồ sơ còn thiếu".
   * Hai bộ quy tắc có hai từ vựng khác nhau và `displayName`/`province` lại TRÙNG TÊN giữa chúng,
   * nên một client chỉ nhìn `details.missing` không phân biệt được bộ nào: nó sẽ dựng nhãn của bộ
   * này cho mã của bộ kia, và câu chữ vẫn trông hợp lý. Phân biệt phải nằm ở MÃ, không ở việc
   * đoán theo endpoint đã gọi.
   */
  SHOP_LISTING_REQUIREMENTS_MISSING: 'SHOP_LISTING_REQUIREMENTS_MISSING',
  /**
   * Hồ sơ xác minh gian hàng đang nằm trong hàng đợi — không gửi thêm phiếu thứ hai.
   *
   * Mã riêng thay vì `CONFLICT` chung: nó là câu trả lời cho một thao tác HỢP LỆ bị bấm lại
   * (tải lại trang, bấm hai lần, mạng chập), nên giao diện nói "đang chờ duyệt" chứ không nói
   * "có lỗi".
   */
  SHOP_VERIFICATION_PENDING: 'SHOP_VERIFICATION_PENDING',
  /*
   * ⚠️ KHÔNG thêm lại `SHOP_VERIFICATION_REQUIRED` (16/09/2026 — ADR 0040).
   *
   * Nó là mã của cổng "phải xác minh pháp nhân mới được mua gói" (ADR 0036). Ghép cổng đó với
   * luồng đăng ký gian hàng trả phí thì thứ tự thành: tạo gian hàng → gửi hồ sơ → CHỜ admin →
   * mới được trả tiền, và trong lúc chờ họ không dùng được gì. Không có thao tác nào còn phát ra
   * mã này, nên nó ra khỏi hợp đồng thay vì ở lại như một nhánh chết mà client vẫn phải dịch.
   *
   * Xác minh KHÔNG bị xoá — nó vẫn là trục riêng (`SHOP_VERIFICATION`, đọc từ phiếu duyệt
   * `tenant`). Nó chỉ thôi làm cổng THU TIỀN.
   *
   * Từ 24/09/2026 nó cũng thôi KHOÁ sửa hồ sơ khi đang chờ: nền tảng tạm ngừng xác minh gian
   * hàng (web không còn nút gửi, màn "Duyệt xe" chỉ nhận phiếu xe), nên một phiếu chờ không còn
   * ai xử lý sẽ khoá hồ sơ vĩnh viễn. `SHOP_VERIFICATION_PENDING` giờ chỉ còn nghĩa "đã có một
   * phiếu chờ, không gửi phiếu thứ hai".
   */
  /**
   * Thao tác này chỉ dành cho CHỦ GIAN HÀNG — tiền của gian hàng (ví, sổ cái, lệnh rút, tài
   * khoản ngân hàng nhận tiền).
   *
   * Trục RIÊNG, không phải permission: permission uỷ quyền được, còn ở đây yêu cầu là không có
   * đường nào để quản lý/nhân viên/người xem chạm vào, kể cả khi được cấp nhầm một khoá.
   * `details.roleKey` để giao diện nói đúng "bạn đang là quản lý" thay vì một câu 403 chung.
   */
  SHOP_OWNER_ONLY: 'SHOP_OWNER_ONLY',

  /**
   * Tài khoản thuộc gian hàng TUYẾN GÓI không gửi được yêu cầu thuê (15/09/2026).
   *
   * Áp cho MỌI thành viên hoạt động — chủ, quản lý, nhân viên, người xem. Chủ xe tuyến HOA HỒNG
   * không nằm trong nhóm này: họ vẫn thuê xe như người dùng thường (ADR 0032 điều 1).
   *
   * `details.tenantName` để giao diện gọi đúng tên gian hàng họ đang đăng nhập, thay vì một câu
   * 403 chung mà người dùng không biết mình đang là ai.
   */
  SHOP_ACCOUNT_CANNOT_BOOK: 'SHOP_ACCOUNT_CANNOT_BOOK',
  /**
   * Không đặt được xe của CHÍNH gian hàng mình.
   *
   * 409 chứ không 403: đây là xung đột giữa yêu cầu và trạng thái (người này ở cả hai phía của
   * chuyến), không phải thiếu quyền. Chặn ở đây là chuyện KẾ TOÁN — hai vai trên một booking
   * khiến phí dịch vụ thu từ chính người nhận tiền, và người duyệt là người gửi.
   */
  CANNOT_BOOK_OWN_VEHICLE: 'CANNOT_BOOK_OWN_VEHICLE',
  /**
   * Tự duyệt yêu cầu do chính mình gửi.
   *
   * Cổng THỨ HAI, độc lập với hai mã trên: dữ liệu cũ có thể đã chứa những yêu cầu tự đặt từ
   * trước khi cổng đầu tồn tại, và chúng không được phép đi tiếp thành đơn.
   */
  CANNOT_DECIDE_OWN_REQUEST: 'CANNOT_DECIDE_OWN_REQUEST',

  /**
   * Tính năng thuộc bộ quản lý của gian hàng TUYẾN GÓI (ADR 0032 điều 6).
   *
   * Khác `FEATURE_NOT_IN_PLAN` (thiếu một cờ trong gói) và khác `FEATURE_READ_ONLY` (hạ bậc gói
   * nhưng vẫn ở tuyến gói): mã này nói tenant KHÔNG Ở tuyến gói, nên cả bộ Manage không thuộc về
   * họ. Lối đi tiếp cũng khác — mua gói, không phải nâng bậc.
   *
   * `details.billingPhase` phân biệt "chưa từng mua gói" với "đã hết hạn + hết ân hạn", hai câu
   * rất khác nhau với người đọc.
   */
  SUBSCRIPTION_TRACK_ONLY: 'SUBSCRIPTION_TRACK_ONLY',

  /**
   * Gian hàng đang có hoá đơn gói ĐÃ NHẬN MỘT PHẦN TIỀN — không tạo hoá đơn mới (16/09/2026).
   *
   * Mã riêng thay vì `CONFLICT` chung vì lối đi tiếp rất cụ thể: chuyển nốt phần còn thiếu theo
   * ĐÚNG mã đối soát cũ, hoặc gọi hỗ trợ. Hai lối còn lại đều hỏng: `purchase()` void hoá đơn
   * `issued` cũ để mỗi tenant chỉ giữ một mã sống, nhưng void một hoá đơn đã có tiền thật là
   * đốt khoản khách đã chuyển; còn để hai hoá đơn payable cùng sống thì
   * `applyBankPaymentWithinTx` coi CẢ HAI đều trả được, và một lần chuyển khoản có thể kích
   * hoạt gói qua mã người dùng tưởng đã bỏ.
   *
   * `details.code` là mã đối soát của hoá đơn đang dang dở — thứ người dùng cần để chuyển nốt.
   */
  SUBSCRIPTION_INVOICE_PARTIALLY_PAID: 'SUBSCRIPTION_INVOICE_PARTIALLY_PAID',

  /** Gian hàng đang bị khoá/chưa hoạt động nên xe không lên chợ được. */
  SHOP_NOT_ACTIVE: 'SHOP_NOT_ACTIVE',
  /**
   * Không xác định được TUYẾN thu phí của gian hàng (`BILLING_PHASE.UNCONFIGURED`) — danh mục
   * gói rỗng, hoặc dòng thuê bao gần nhất thiếu `billing_mode`.
   *
   * Ném ở đường GHI TIỀN (duyệt yêu cầu, tạo hold) thay vì đoán một tuyến. Đoán ở đây tạo ra một
   * đơn có giá đã thoả thuận với khách nhưng sai dòng tiền — và đơn đó bất biến sau khi tạo
   * (ADR 0024), nên không có đường sửa nào ngoài can thiệp dữ liệu.
   *
   * `details.phase` để hỗ trợ biết phải sửa gì. Đây là lỗi VẬN HÀNH, không phải lỗi người dùng.
   */
  TENANT_BILLING_NOT_CONFIGURED: 'TENANT_BILLING_NOT_CONFIGURED',
  /**
   * Xe chưa đủ điều kiện lên chợ. `details.missing[]` mang khoá `PUBLISH_REQUIREMENT` —
   * MÃ, không phải câu tiếng Việt, nên giao diện chỉ đúng từng mục ở ngôn ngữ đang dùng
   * (ADR 0012) thay vì hiện một dòng "dữ liệu chưa hợp lệ".
   */
  VEHICLE_PUBLISH_INCOMPLETE: 'VEHICLE_PUBLISH_INCOMPLETE',
  /**
   * Bật công tắc hiển thị cho một chiếc xe CHƯA qua cổng duyệt (ADR 0048 điều 3).
   *
   * `details.publicStatus` là trạng thái kiểm duyệt hiện tại, để giao diện chỉ đúng lối đi tiếp:
   * nháp/cần bổ sung/bị từ chối thì gửi duyệt, đang chờ duyệt thì đợi.
   */
  VEHICLE_NOT_APPROVED_PUBLIC: 'VEHICLE_NOT_APPROVED_PUBLIC',
  /**
   * Bật công tắc hiển thị cho một chiếc xe ĐANG BỊ NỀN TẢNG ẨN (`public_status = hidden`).
   *
   * Mã RIÊNG chứ không dùng chung `VEHICLE_NOT_APPROVED_PUBLIC`, vì lối đi tiếp khác hẳn: ở đây
   * KHÔNG có nút nào chủ xe bấm được. Gộp hai mã là mời họ đi gửi duyệt lại một chiếc xe mà
   * nền tảng vừa cố ý gỡ xuống (ADR 0048 điều 4).
   */
  VEHICLE_PLATFORM_HIDDEN: 'VEHICLE_PLATFORM_HIDDEN',

  /**
   * Phiếu duyệt đã được một người duyệt KHÁC xử lý (hoặc đã rời hàng đợi) — mọi thao tác ghi lên
   * phiếu đó (quyết định, đánh dấu kiểm tra, ghi chú) dừng lại.
   *
   * Mã riêng thay vì `INVALID_STATUS_TRANSITION` chung: giao diện cần nói đúng chuyện đã xảy ra
   * ("phiếu vừa được xử lý, đang tải lại") và làm mới phiếu, chứ không hiện một lỗi trạng thái
   * khiến người duyệt bấm lại lần nữa. `details.status` là trạng thái hiện tại của phiếu.
   */
  APPROVAL_ALREADY_DECIDED: 'APPROVAL_ALREADY_DECIDED',
  /**
   * Phê duyệt khi danh mục kiểm tra THỦ CÔNG còn mục chưa đạt. `details.missing[]` mang khoá
   * `VEHICLE_REVIEW_CHECK` — cùng luật `missingVehicleReviewChecks` mà web dùng để khoá nút.
   */
  APPROVAL_CHECKLIST_INCOMPLETE: 'APPROVAL_CHECKLIST_INCOMPLETE',
  /**
   * Ghi chú nội bộ đã được người khác sửa sau lần bạn tải phiếu — không ghi đè âm thầm.
   * `details.current` là bản đang lưu (nội dung, người sửa, thời điểm) để giao diện cho người
   * duyệt đọc trước khi quyết định ghi lại.
   */
  APPROVAL_NOTE_CONFLICT: 'APPROVAL_NOTE_CONFLICT',
  /**
   * Phê duyệt một chiếc xe mà xe SỐNG đã khác hồ sơ gửi duyệt: thông tin CĂN CƯỚC (biển số, loại
   * xe, hộp số, nhiên liệu, năm sản xuất) bị sửa sau khi gửi — duyệt là KHOÁ các trường đó, không
   * được khoá giá trị người duyệt chưa từng thấy — hoặc xe không còn qua cổng lên chợ. `details` là
   * `{ changedLockedFields, missingRequirements }`. Lối đi tiếp: yêu cầu bổ sung để chủ xe gửi lại.
   */
  APPROVAL_SUBJECT_CHANGED: 'APPROVAL_SUBJECT_CHANGED',
  /**
   * Người duyệt bấm Phê duyệt trên một hồ sơ đã CŨ: chủ xe sửa xe sau khi màn duyệt được tải,
   * nên snapshot đã được dựng lại và `capturedAt` không còn khớp (24/09/2026).
   *
   * Đây là cái giá của việc snapshot tự làm mới theo mỗi lần chủ xe lưu — đổi lại, không ai còn
   * kẹt giữa "admin không duyệt được" và "chủ xe không gửi lại được". `details` là
   * `{ expectedCapturedAt, currentCapturedAt }`. Lối đi tiếp: tải lại phiếu và đọc bản mới —
   * KHÔNG phải thử lại cùng một mốc.
   */
  APPROVAL_SNAPSHOT_STALE: 'APPROVAL_SNAPSHOT_STALE',

  // Hạ tầng
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Upload ảnh cần đủ bộ env R2 — thiếu thì endpoint presign trả 503 kèm mã này. */
  UPLOADS_NOT_CONFIGURED: 'UPLOADS_NOT_CONFIGURED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiError).error?.code === 'string'
  );
}

/**
 * Tiền tệ đi qua JSON dưới dạng **string**, không phải number — ADR 0007.
 *
 * Prisma trả `Decimal`; ép sang `number` làm mất chính xác ở phép cộng nhiều khoản.
 * Frontend format bằng `Intl.NumberFormat`, tính toán bằng thư viện decimal.
 */
export type MoneyString = string;

/** Timestamp ISO-8601 ở UTC. Frontend hiển thị theo Asia/Ho_Chi_Minh (CLAUDE.md mục 9). */
export type IsoDateTimeString = string;

/** ULID, 26 ký tự Crockford base32. */
export type Ulid = string;
