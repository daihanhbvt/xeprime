/**
 * Danh mục tag của OpenAPI — nguồn DUY NHẤT quyết định Swagger UI xổ ra những nhóm nào,
 * theo thứ tự nào, kèm mô tả gì.
 *
 * Vì sao cần file này: `@ApiTags('x')` rải trong controller chỉ GẮN route vào nhóm, nó không
 * mô tả nhóm. Tag không được khai báo ở `DocumentBuilder` vẫn hiện trong UI nhưng không có mô
 * tả và bị đẩy xuống cuối theo thứ tự ngẫu nhiên — 50 nhóm như vậy thì người mới đọc không
 * biết bắt đầu từ đâu.
 *
 * Kỷ luật: thêm controller mới thì thêm tag vào đây. `openapi-contract.spec.ts` so hai chiều
 * (tag dùng trong code ↔ tag khai báo ở đây) và fail nếu lệch, nên không thể quên âm thầm.
 */

export interface ApiTagGroup {
  /** Tiêu đề nhóm — dùng cho `x-tagGroups`; Swagger UI thuần bỏ qua, Redoc/Scalar gom theo nó. */
  readonly title: string;
  readonly tags: ReadonlyArray<{ readonly name: string; readonly description: string }>;
}

/**
 * Thứ tự ở đây là thứ tự hiện trong Swagger UI: đi từ thứ ai cũng gọi được (public) vào dần
 * tới nội bộ nền tảng — đúng đường một dev mới lần theo khi tìm hiểu hệ thống.
 */
export const API_TAG_GROUPS: readonly ApiTagGroup[] = [
  {
    title: 'Hạ tầng',
    tags: [{ name: 'health', description: 'Liveness/readiness — có ping PostgreSQL thật.' }],
  },
  {
    title: 'Xác thực & tài khoản',
    tags: [
      {
        name: 'auth',
        description:
          'Đăng nhập/đăng ký/đăng xuất và phiên làm việc. Session là httpOnly cookie do API phát ' +
          '(ADR 0002) — client KHÔNG đọc được token bằng JavaScript và không tự gắn header `Authorization`.',
      },
      { name: 'users', description: 'Hồ sơ người dùng đang đăng nhập.' },
      {
        name: 'phone-verification',
        description: 'Gửi và xác minh OTP số điện thoại cho luồng đặt xe của khách.',
      },
      {
        name: 'uploads',
        description:
          'Cấp presigned URL để client upload thẳng lên Cloudflare R2. File KHÔNG đi qua API — ' +
          'endpoint chỉ ký URL và xác nhận sau khi upload xong.',
      },
    ],
  },
  {
    title: 'Công khai (marketplace — không cần đăng nhập)',
    tags: [
      {
        name: 'public-listings',
        description:
          'Tìm kiếm xe, chi tiết tin đăng, trang gian hàng, điểm đến và báo giá thuê. Đọc từ bảng ' +
          'chiếu `public_listings` (ADR 0008), không đọc thẳng bảng nghiệp vụ.',
      },
      {
        name: 'public-booking-requests',
        description:
          'Khách gửi yêu cầu thuê và tra cứu yêu cầu của mình. Yêu cầu CHƯA giữ chỗ lịch — gian ' +
          'hàng duyệt mới sinh đơn (ADR 0006, ADR 0011).',
      },
      {
        name: 'public-reviews',
        description: 'Đánh giá hiển thị công khai trên tin đăng và trang gian hàng.',
      },
      { name: 'public-banners', description: 'Banner khuyến mãi hiển thị ở trang chủ marketplace.' },
      {
        name: 'catalog',
        description: 'Danh mục hãng/dòng xe dùng chung khi đăng xe và khi lọc tìm kiếm.',
      },
      { name: 'locations', description: 'Tỉnh/thành và khu vực dùng cho địa chỉ và bộ lọc.' },
      {
        name: 'holidays',
        description:
          'Lịch nghỉ lễ Việt Nam, đồng bộ mỗi ngày từ Google Calendar bởi `apps/worker`. CHỈ ĐỌC ' +
          'và chỉ để HIỂN THỊ: ngày lễ không khoá xe, không đổi giá, không chặn đặt xe (ADR 0014).',
      },
    ],
  },
  {
    title: 'Gian hàng — thiết lập',
    tags: [
      {
        name: 'tenants',
        description:
          'Hồ sơ gian hàng và trạng thái duyệt. Client KHÔNG tự đặt `status`/`approvedPublic` — ' +
          'phải đi qua `approval_tasks`.',
      },
      { name: 'members', description: 'Nhân sự của gian hàng: mời, đổi vai trò, vô hiệu hoá.' },
      {
        name: 'rbac',
        description:
          'Tra cứu vai trò và quyền. Quyền đọc từ DB mỗi request, không nằm trong session (ADR 0002).',
      },
      { name: 'branches', description: 'Chi nhánh/điểm giao nhận xe của gian hàng.' },
      {
        name: 'rental-policies',
        description: 'Chính sách cho thuê: giấy tờ, thế chấp, giao nhận, huỷ chuyến.',
      },
      {
        name: 'pricing',
        description:
          'Giá theo ngày và giá gói dài hạn. Gói dài hạn là gói CỐ ĐỊNH theo tháng lịch — không ' +
          'nhân `số tháng × 30` (ADR 0011).',
      },
    ],
  },
  {
    title: 'Gian hàng — đội xe',
    tags: [
      { name: 'vehicles', description: 'Đội xe của gian hàng: tạo, sửa, đăng/ẩn tin, trạng thái.' },
      {
        name: 'vehicle-documents',
        description: 'Giấy tờ xe: đăng kiểm, bảo hiểm, đăng ký — kèm ngày hết hạn.',
      },
      { name: 'vehicle-maintenance', description: 'Phiếu bảo dưỡng/sửa chữa của một xe.' },
      { name: 'maintenance', description: 'Bảng bảo dưỡng toàn đội xe — việc đến hạn và quá hạn.' },
      { name: 'drivers', description: 'Tài xế của gian hàng cho dịch vụ có lái.' },
    ],
  },
  {
    title: 'Gian hàng — vận hành thuê',
    tags: [
      {
        name: 'booking-requests',
        description: 'Hộp thư yêu cầu thuê: duyệt, từ chối, chốt lịch thành đơn.',
      },
      {
        name: 'bookings',
        description:
          'Đơn thuê. Chống trùng lịch nằm ở constraint `EXCLUDE USING gist` trong DB (ADR 0006) — ' +
          'tầng app KHÔNG tự quyết định lịch trống.',
      },
      { name: 'calendar', description: 'Lịch xe dạng resource-timeline và khoá xe thủ công.' },
      {
        name: 'booking-handovers',
        description: 'Biên bản giao và nhận xe: odo, nhiên liệu, ảnh hiện trạng, chữ ký.',
      },
      { name: 'handover-queue', description: 'Hàng chờ giao/nhận xe trong ngày.' },
      {
        name: 'booking-settlement',
        description: 'Tất toán đơn: phụ phí, đền bù, hoàn cọc — chốt số cuối cùng của chuyến.',
      },
      { name: 'contracts', description: 'Hợp đồng thuê sinh từ đơn và trạng thái ký.' },
      { name: 'customers', description: 'Khách hàng của gian hàng và giấy tờ tuỳ thân đã thu.' },
      { name: 'customer-trips', description: 'Chuyến xe nhìn từ phía tài khoản khách.' },
    ],
  },
  {
    title: 'Gian hàng — tài chính',
    tags: [
      {
        name: 'payments',
        description:
          'Giao dịch thu/chi của đơn. Giai đoạn này KHÔNG có thanh toán trực tuyến — toàn bộ là ' +
          'ghi sổ thủ công (ADR 0013).',
      },
      { name: 'receipts', description: 'Phiếu thu/phiếu chi của sổ quỹ.' },
      { name: 'finance-categories', description: 'Danh mục hạng mục thu/chi.' },
      { name: 'finance-overview', description: 'Tổng quan dòng tiền và công nợ của gian hàng.' },
      {
        name: 'subscription',
        description:
          '"Gói của tôi": gói hiện hành, hạn mức chỗ theo loại xe, lượt miễn phí (ADR 0026) và ' +
          'tự mua gói. Mua = sinh hoá đơn + mã đối soát XPG; gói CHỈ kích hoạt khi tiền đã về ' +
          '(ADR 0026 điều 4).',
      },
      {
        name: 'billing',
        description:
          'Đối soát tiền vào qua SePay (ADR 0016/0022): webhook ghi giao dịch ngân hàng thô, ' +
          'khớp theo mã đối soát và kích hoạt gói khi hoá đơn đủ tiền. Idempotent bằng unique ' +
          'DB; trùng giao dịch trả 200.',
      },
    ],
  },
  {
    title: 'Tương tác',
    tags: [
      { name: 'notifications', description: 'Thông báo trong ứng dụng và trạng thái đã đọc.' },
      { name: 'reviews', description: 'Đánh giá gian hàng nhận được và phản hồi của chủ xe.' },
      {
        name: 'conversations',
        description: 'Danh sách hội thoại và thành viên. PostgreSQL là source of truth (ADR 0009).',
      },
      {
        name: 'chat',
        description:
          'Tin nhắn và đánh dấu đã đọc. Firestore chỉ là bản chiếu realtime của ~30–50 tin gần ' +
          'nhất — ghi luôn vào PostgreSQL trước rồi đồng bộ qua outbox (ADR 0009).',
      },
    ],
  },
  {
    title: 'Nền tảng (platform_admin / platform_staff)',
    tags: [
      {
        name: 'platform-admin',
        description: 'Tác vụ quản trị nền tảng dùng chung và hàng chờ duyệt.',
      },
      { name: 'platform-dashboard', description: 'Số liệu tổng quan toàn nền tảng.' },
      { name: 'platform-tenants', description: 'Quản lý gian hàng: duyệt, tạm ngưng, xem chi tiết.' },
      { name: 'platform-vehicles', description: 'Duyệt xe lên marketplace và gỡ tin vi phạm.' },
      { name: 'platform-bookings', description: 'Tra cứu đơn thuê xuyên gian hàng để hỗ trợ.' },
      { name: 'platform-customers', description: 'Tra cứu tài khoản khách toàn nền tảng.' },
      { name: 'platform-staff', description: 'Nhân sự nền tảng và vai trò của họ.' },
      { name: 'platform-catalog', description: 'Biên tập danh mục hãng/dòng xe dùng chung.' },
      { name: 'platform-banners', description: 'Biên tập banner marketplace.' },
      { name: 'platform-plans', description: 'Gói dịch vụ bán cho gian hàng và hạn mức đi kèm.' },
      { name: 'platform-subscriptions', description: 'Thuê bao của gian hàng: gia hạn, đổi gói.' },
      {
        name: 'platform-audit',
        description: 'Nhật ký `audit_logs` — mọi hành động quản trị quan trọng đều để lại vết.',
      },
    ],
  },
];

/** Danh sách phẳng theo đúng thứ tự nhóm — dùng cho `DocumentBuilder.addTag()`. */
export const API_TAGS = API_TAG_GROUPS.flatMap((group) => group.tags);

/** `x-tagGroups`: Redoc/Scalar gom nhóm theo key này; Swagger UI bỏ qua, không hại gì. */
export const API_TAG_GROUPS_EXTENSION = API_TAG_GROUPS.map((group) => ({
  name: group.title,
  tags: group.tags.map((tag) => tag.name),
}));
