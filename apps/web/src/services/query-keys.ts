import type { QueryParams } from './api-client';

/**
 * Query key tập trung một chỗ để `invalidateQueries` không phải đoán chuỗi.
 *
 * Quy ước: key luôn bắt đầu bằng tên domain, tham số nằm ở phần tử cuối dạng object —
 * nhờ vậy `invalidateQueries({ queryKey: queryKeys.calendar.all })` xoá được cả nhánh.
 */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
  },
  /** Hồ sơ tài khoản khách (`/users/me`) — khác `auth.me` (scope + quyền của phiên). */
  account: {
    all: ['account'] as const,
    profile: () => ['account', 'profile'] as const,
  },
  tenants: {
    all: ['tenants'] as const,
    current: () => ['tenants', 'current'] as const,
  },
  shop: {
    all: ['shop'] as const,
    current: () => ['shop', 'current'] as const,
  },
  approvals: {
    all: ['approvals'] as const,
    list: (params: QueryParams) => ['approvals', 'list', params] as const,
    detail: (id: string) => ['approvals', 'detail', id] as const,
  },
  calendar: {
    all: ['calendar'] as const,
    resources: (params: QueryParams) => ['calendar', 'resources', params] as const,
    events: (params: QueryParams) => ['calendar', 'events', params] as const,
    /** Hàng "Xe còn trống" — đếm ở backend trên toàn đội xe đã lọc. */
    availability: (params: QueryParams) => ['calendar', 'availability', params] as const,
    /** Dấu "giá riêng" theo ô (mọi xe đang lọc, một request cho cả lưới). */
    dailyPrices: (params: QueryParams) => ['calendar', 'daily-prices', params] as const,
    /** Chi tiết một lịch khoá xe — mở khi bấm vào event `blocked_range`. */
    block: (id: string) => ['calendar', 'block', id] as const,
    /** Báo giá nội bộ cho luồng Đặt xe trên lịch. */
    quote: (params: QueryParams) => ['calendar', 'quote', params] as const,
    /** Bản ghi đè giá theo ngày của MỘT xe (dialog đặt giá). */
    vehicleDailyPrices: (vehicleId: string, params: QueryParams) =>
      ['calendar', 'vehicle-daily-prices', vehicleId, params] as const,
  },
  /**
   * Danh mục hành chính (tỉnh/thành). Bản chọn-được (`provinces`) và bản quản trị (`admin`) nằm
   * CHUNG một nhánh: admin bật/tắt một tỉnh là cả hai phải làm mới, không để form còn chọn được
   * tỉnh vừa bị khoá.
   */
  locations: {
    all: ['locations'] as const,
    provinces: () => ['locations', 'provinces'] as const,
    admin: (params: QueryParams) => ['locations', 'admin', params] as const,
  },
  /** Tài xế của gian hàng (17/08) — danh sách CRUD + bộ chọn gán vào đơn đọc chung. */
  drivers: {
    all: ['drivers'] as const,
    list: (params: QueryParams) => ['drivers', 'list', params] as const,
    /** Bộ chọn gán đơn theo khung giờ (17/08) — cache riêng theo cửa sổ thời gian. */
    assignable: (window: { pickupAt: string; returnAt: string; excludeBookingId?: string }) =>
      ['drivers', 'assignable', window] as const,
  },
  /** Chi nhánh gian hàng — mọi màn có bộ chọn chi nhánh đọc chung nhánh này. */
  branches: {
    all: ['branches'] as const,
    list: (params: QueryParams) => ['branches', 'list', params] as const,
    detail: (id: string) => ['branches', 'detail', id] as const,
  },
  /** Banner hero trang chủ — public + bản quản trị chung một nhánh để mutation invalidate cả hai. */
  banners: {
    all: ['banners'] as const,
    list: () => ['banners', 'public'] as const,
    admin: () => ['banners', 'admin'] as const,
  },
  /** Danh mục lọc dùng chung (hãng/kiểu dáng/nhiên liệu/tiện ích) — một key cho cả app. */
  catalog: {
    all: ['catalog'] as const,
    list: () => ['catalog', 'list'] as const,
    admin: (params: QueryParams) => ['catalog', 'admin', params] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: (params: QueryParams) => ['vehicles', 'list', params] as const,
    /** Bộ chọn xe tải-dần theo cuộn — key KHÔNG chứa page (page là pageParam của TanStack). */
    infinite: (params: QueryParams) => ['vehicles', 'list-infinite', params] as const,
    detail: (id: string) => ['vehicles', 'detail', id] as const,
    /** Chỉ số thẻ xe theo nhóm id — nằm dưới nhánh `vehicles` để mutation xe tự invalidate luôn. */
    stats: (ids: readonly string[]) => ['vehicles', 'stats', ids] as const,
    /** Đếm đội xe theo trạng thái vận hành — dải chỉ số đầu danh sách. */
    fleetSummary: () => ['vehicles', 'fleet-summary'] as const,
    /**
     * Việc cần làm + KM hiện tại theo lô xe (Wave 8). Nằm dưới nhánh `vehicles` để mọi mutation
     * xe tự làm mới luôn; các miền khác (bàn giao, bảo dưỡng, giấy tờ) invalidate nhánh này khi
     * dữ liệu của chúng đổi — xem `useInvalidateVehicleSurfaces`.
     */
    alerts: (ids: readonly string[]) => ['vehicles', 'alerts', ids] as const,
    /** Tiền tố của mọi lô cảnh báo — invalidate một phát là mọi trang đang mở đều làm mới. */
    alertsAll: () => ['vehicles', 'alerts'] as const,
    /** Tổng hợp Hồ sơ 360 của một xe (chỉ số + đơn thuê theo quyền). */
    summary: (id: string) => ['vehicles', 'summary', id] as const,
    /** Giá & chính sách theo xe (nguồn kế thừa/ghi đè) — nằm dưới nhánh vehicles để mutation xe invalidate luôn. */
    pricing: (id: string) => ['vehicles', 'pricing', id] as const,
    /** Hồ sơ nguồn xe & tài chính (Wave 4). */
    source: (id: string) => ['vehicles', 'source', id] as const,
    /** Giấy tờ xe (Wave 5). */
    documents: (id: string) => ['vehicles', 'documents', id] as const,
    document: (id: string, documentId: string) =>
      ['vehicles', 'documents', id, documentId] as const,
    /** Lịch sử phiên bản file — endpoint riêng sau quyền `view_files` (Wave 5.1). */
    documentVersions: (id: string, documentId: string) =>
      ['vehicles', 'documents', id, documentId, 'versions'] as const,
    /** Bảo dưỡng & KM của một xe (Wave 6) — nhánh gốc để invalidate cả cụm sau mutation. */
    maintenance: (id: string) => ['vehicles', 'maintenance', id] as const,
    maintenanceProfile: (id: string) => ['vehicles', 'maintenance', id, 'profile'] as const,
    maintenanceRecords: (id: string) => ['vehicles', 'maintenance', id, 'records'] as const,
    odometerHistory: (id: string, page: number) =>
      ['vehicles', 'maintenance', id, 'odometer', page] as const,
  },
  /** Trung tâm bảo dưỡng toàn đội xe (Wave 6) — domain riêng vì không thuộc một xe nào. */
  maintenance: {
    all: ['maintenance'] as const,
    board: (params: QueryParams) => ['maintenance', 'board', params] as const,
    summary: () => ['maintenance', 'summary'] as const,
    /**
     * Hàng đợi "Thiếu KM trả" (Wave 8) — nằm dưới nhánh `maintenance` vì nó là một nhóm việc
     * của Trung tâm bảo dưỡng, dù dữ liệu đến từ bàn giao.
     */
    missingReturnKm: (params: QueryParams) => ['maintenance', 'missing-return-km', params] as const,
  },
  /** Chính sách thuê mặc định của gian hàng (Wave 2). */
  rentalPolicies: {
    all: ['rental-policies'] as const,
    /** Mặc định theo LOẠI XE (17/08) — hai tab Ô tô/Xe máy là hai cache riêng. */
    shop: (vehicleType: string) => ['rental-policies', 'shop', vehicleType] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (params: QueryParams) => ['bookings', 'list', params] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
    /** Bàn giao xe của một đơn (Wave 7) — nằm dưới nhánh `bookings` vì xác nhận bàn giao
     *  đổi luôn trạng thái đơn, invalidate một chỗ là đủ. */
    handovers: (id: string) => ['bookings', 'handovers', id] as const,
    /**
     * Quyết toán cuối chuyến (Wave 10): phát sinh + cọc đã thu + đề xuất hoàn. Nằm dưới nhánh
     * `bookings` để xác nhận trả xe (đổi trạng thái đơn) tự làm mới luôn thẻ cọc.
     */
    settlement: (id: string) => ['bookings', 'settlement', id] as const,
  },
  bookingRequests: {
    all: ['booking-requests'] as const,
    list: (params: QueryParams) => ['booking-requests', 'list', params] as const,
  },
  /**
   * Sổ khách của GIAN HÀNG (S-01) — khác hẳn `/manage/admin/customers` của nền tảng, nên nhánh
   * riêng: invalidate một bên không được kéo theo bên kia.
   *
   * Mọi thứ thuộc một khách nằm DƯỚI `detail(id)` (lịch sử thuê, ghi chú, giấy tờ): đổi mức rủi
   * ro hay lưu trữ hồ sơ là làm mới cả cụm bằng một lần invalidate, không phải nhớ 4 key.
   */
  customers: {
    all: ['customers'] as const,
    list: (params: QueryParams) => ['customers', 'list', params] as const,
    summary: () => ['customers', 'summary'] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
    bookings: (id: string, page: number) => ['customers', 'detail', id, 'bookings', page] as const,
    notes: (id: string, page: number) => ['customers', 'detail', id, 'notes', page] as const,
    documents: (id: string) => ['customers', 'detail', id, 'documents'] as const,
    /**
     * URL ký để hiện ẢNH THU NHỎ của giấy tờ. Tách khỏi `documents` vì vòng đời khác hẳn:
     * metadata giấy tờ ổn định, còn URL ký sống ~2 phút nên phải tự làm mới.
     */
    documentPreviews: (id: string, documentIds: readonly string[]) =>
      ['customers', 'detail', id, 'document-previews', documentIds] as const,
  },
  members: {
    all: ['members'] as const,
    list: (params: QueryParams) => ['members', 'list', params] as const,
  },
  receipts: {
    all: ['receipts'] as const,
    list: (params: QueryParams) => ['receipts', 'list', params] as const,
    detail: (id: string) => ['receipts', 'detail', id] as const,
    categories: (params: QueryParams) => ['receipts', 'categories', params] as const,
    summary: (params: QueryParams) => ['receipts', 'summary', params] as const,
    bookingOptions: (params: QueryParams) => ['receipts', 'booking-options', params] as const,
  },
  payments: {
    all: ['payments'] as const,
    history: (bookingId: string) => ['payments', 'history', bookingId] as const,
  },
  debts: {
    all: ['debts'] as const,
    list: (params: QueryParams) => ['debts', 'list', params] as const,
  },
  finance: {
    all: ['finance'] as const,
    summary: (params: QueryParams) => ['finance', 'summary', params] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
  },
  platformDashboard: {
    all: ['platform-dashboard'] as const,
    summary: () => ['platform-dashboard', 'summary'] as const,
  },
  platformStaff: {
    all: ['platform-staff'] as const,
    list: (params: QueryParams) => ['platform-staff', 'list', params] as const,
  },
  billing: {
    all: ['billing'] as const,
    plans: (status: string) => ['billing', 'plans', status] as const,
    subscriptions: (tenantId: string, page: number) =>
      ['billing', 'subscriptions', tenantId, page] as const,
  },
  marketplace: {
    all: ['marketplace'] as const,
    listings: (params: QueryParams) => ['marketplace', 'listings', params] as const,
    /** /search tải vô hạn — key KHÔNG chứa page (page là pageParam của TanStack). */
    listingsInfinite: (params: QueryParams) =>
      ['marketplace', 'listings-infinite', params] as const,
    facets: (params: QueryParams) => ['marketplace', 'facets', params] as const,
    /**
     * Chi tiết một xe public, tải TỪ TRÌNH DUYỆT. Trang `/listings/[id]` render server nên không
     * dùng key này; overlay yêu cầu thuê mở từ thẻ xe thì cần (thẻ chỉ có dữ liệu tóm tắt).
     */
    listing: (vehicleId: string) => ['marketplace', 'listing', vehicleId] as const,
    reviews: (vehicleId: string, params: QueryParams) =>
      ['marketplace', 'reviews', vehicleId, params] as const,
    shopListings: (slug: string, params: QueryParams) =>
      ['marketplace', 'shop-listings', slug, params] as const,
    /** Báo giá công khai theo khoảng ngày — nguồn PricingService, FE không tự cộng trừ. */
    quote: (vehicleId: string, params: QueryParams) =>
      ['marketplace', 'quote', vehicleId, params] as const,
    destinations: (params: QueryParams) => ['marketplace', 'destinations', params] as const,
    shops: (params: QueryParams) => ['marketplace', 'shops', params] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (params: QueryParams) => ['notifications', 'list', params] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
  reviews: {
    all: ['reviews'] as const,
  },
  /**
   * Chuyến của KHÁCH (Wave 11). Nhánh riêng chứ không nằm dưới `bookings`: đó là bề mặt của
   * shop, invalidate chung sẽ kéo theo cả những query khách không có quyền gọi.
   */
  trips: {
    all: ['trips'] as const,
    list: (params: QueryParams) => ['trips', 'list', params] as const,
    detail: (id: string) => ['trips', 'detail', id] as const,
  },
  chat: {
    all: ['chat'] as const,
    conversations: () => ['chat', 'conversations'] as const,
    unreadCount: () => ['chat', 'unread-count'] as const,
  },
} as const;
