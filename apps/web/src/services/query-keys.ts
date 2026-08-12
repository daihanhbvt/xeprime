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
    detail: (id: string) => ['vehicles', 'detail', id] as const,
    /** Chỉ số thẻ xe theo nhóm id — nằm dưới nhánh `vehicles` để mutation xe tự invalidate luôn. */
    stats: (ids: readonly string[]) => ['vehicles', 'stats', ids] as const,
    /** Đếm đội xe theo trạng thái vận hành — dải chỉ số đầu danh sách. */
    fleetSummary: () => ['vehicles', 'fleet-summary'] as const,
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
  },
  /** Chính sách thuê mặc định của gian hàng (Wave 2). */
  rentalPolicies: {
    all: ['rental-policies'] as const,
    shop: () => ['rental-policies', 'shop'] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (params: QueryParams) => ['bookings', 'list', params] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },
  bookingRequests: {
    all: ['booking-requests'] as const,
    list: (params: QueryParams) => ['booking-requests', 'list', params] as const,
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
    myTrips: (params: QueryParams) => ['reviews', 'my-trips', params] as const,
  },
  chat: {
    all: ['chat'] as const,
    conversations: () => ['chat', 'conversations'] as const,
    unreadCount: () => ['chat', 'unread-count'] as const,
  },
} as const;
