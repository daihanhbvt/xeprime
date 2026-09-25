'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import {
  SUPPORT_CAPABILITY,
  SUPPORT_VEHICLE_PINNED_FIELDS,
  type SupportCapability,
} from '@xeprime/types';
import {
  VEHICLE_EDIT_TAB,
  VEHICLE_MANAGE_SECTION,
  type VehicleEditTab,
  type VehicleManageSection,
} from '@/constants/routes';
import { toTenantSupportRoute } from '@/constants/tenant-support-routes';
import type { SupportContext } from './types';

/**
 * Ngữ cảnh TẬP TRUNG của phiên hỗ trợ gian hàng (ADR 0050) — thứ duy nhất component hiện có đọc
 * để biết mình đang được nhân sự nền tảng dùng thay gian hàng.
 *
 * Không có prop `isAdmin` nào đi qua cây component: `usePermissions`, `useFeatureStates` và
 * `useWorkspace` đã tự đổi nguồn khi đứng trong phiên, nên phần lớn component không cần biết gì.
 * Chỉ vài chỗ có thao tác mà QUYỀN tenant không phân biệt được (cùng `vehicles.update` mà một bên
 * sửa ảnh, một bên sửa giá) mới hỏi thêm ở đây — và luật thật vẫn nằm ở backend.
 *
 * File lá: không import gì từ feature xe, để feature xe import ngược lại nó mà không vòng.
 */
export interface SupportSession {
  readonly contextId: string;
  readonly context: SupportContext;
  /** Capability server cấp — hiện/ẩn nút, KHÔNG phải cổng bảo vệ. */
  can(capability: SupportCapability): boolean;
}

const SupportSessionContext = createContext<SupportSession | null>(null);

export function SupportSessionScope({
  session,
  children,
}: {
  session: SupportSession;
  children: ReactNode;
}) {
  return (
    <SupportSessionContext.Provider value={session}>{children}</SupportSessionContext.Provider>
  );
}

/** `null` ngoài một phiên hỗ trợ — tức là ở mọi màn của gian hàng/chủ xe thật. */
export function useSupportSession(): SupportSession | null {
  return useContext(SupportSessionContext);
}

/**
 * BẢN KIỂM KÊ những gì phiên hỗ trợ gian hàng ẩn trong các màn DÙNG LẠI (ADR 0050 §10–12).
 *
 * Phần lớn khu bị ẩn tự ẩn nhờ quyền (quyền trong phiên suy từ capability) hoặc cờ gói
 * (`SUPPORT_HIDDEN_FEATURES`). Bảng này là phần CÒN LẠI — những khối mà quyền đọc của gian hàng
 * không phân biệt được — và là chỗ DUY NHẤT để đọc "phiên đang ẩn gì". Component hỏi đúng một câu có
 * tên (`useSupportHides(AREA)`), không tự đọc `useSupportSession() !== null`: một cờ "đang là
 * admin" ở dạng hook sẽ trôi dần mỗi lần có màn mới. Đợt 2B mở lại một khu là xoá một dòng ở đây.
 *
 * Mọi khu hiện đều ẩn trong MỌI phiên (xem lẫn hỗ trợ thao tác); ngoài phiên không khu nào bị ẩn.
 */
export const SUPPORT_HIDDEN_AREA = {
  /**
   * Hành động bị TỪ CHỐI: ngoài phiên, màn gian hàng để nút ghi MỜ kèm lý do "cần quyền …" (nhân
   * viên cần biết nút tồn tại và xin ai). Trong phiên đó là chỉ dẫn sai — không có quyền nào "còn
   * thiếu" để đi xin — nên hành động không mở thì không hiện.
   */
  DENIED_ACTIONS: 'denied_actions',
  /** Quyết toán cọc · phụ phí · hoàn tiền của một đơn — tiền của gian hàng và khách. */
  SETTLEMENT: 'settlement',
  /** Ghi chú + giấy tờ khách (lời bình rủi ro bị server lược) — sổ RIÊNG của gian hàng. */
  CUSTOMER_PRIVATE: 'customer_private',
  /** Nút + lời mời xác nhận bàn giao: phiên không bao giờ giao/nhận xe. */
  HANDOVER_ACTIONS: 'handover_actions',
  /** Nhắn tin khách/chủ xe: phiên không chat thay gian hàng. */
  CHAT: 'chat',
  /** Lời mời nâng cấp gói + khối chuyển khoản của hoá đơn đang chờ — đó là việc MUA gói. */
  PLAN_PURCHASE: 'plan_purchase',
  /** Mã số thuế + số giấy phép kinh doanh của hồ sơ cửa hàng (địa chỉ gian hàng vẫn hiện). */
  SHOP_LEGAL: 'shop_legal',
  /** Thẻ cẩm nang + chứng từ mẫu của Owner Lite — tài liệu CÁ NHÂN ở khu tài khoản chủ xe. */
  OWNER_GUIDES: 'owner_guides',
  /** Lên lịch / dời lịch / hoàn tất phiếu bảo dưỡng, sửa chu kỳ — chiếm lịch xe, ghi KM, sinh phiếu chi. */
  MAINTENANCE_SCHEDULE: 'maintenance_schedule',
} as const;

export type SupportHiddenArea = (typeof SUPPORT_HIDDEN_AREA)[keyof typeof SUPPORT_HIDDEN_AREA];

/** Khu `area` có bị ẩn ở màn đang dựng không — `true` chỉ trong một phiên hỗ trợ. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `area` là câu hỏi có tên; mọi khu hiện ẩn như nhau
export function useSupportHides(area: SupportHiddenArea): boolean {
  return useSupportSession() !== null;
}

/**
 * Đích của một link trong màn dùng lại: ngoài phiên là chính `href`; trong phiên là route của
 * phiên, hoặc `null` khi màn đó KHÔNG mở trong phiên (ADR 0050 §12). Component dùng nó để không
 * dựng một link chắc chắn bị chặn — `SupportNavigationScope` vẫn là lưới an toàn cho link sót.
 */
export function useAvailableHref(): (href: string) => string | null {
  const session = useSupportSession();
  const contextId = session?.contextId ?? null;
  return useCallback(
    (href: string) => {
      if (!contextId) return href;
      const route = toTenantSupportRoute(contextId, href);
      return route.kind === 'blocked' ? null : route.href;
    },
    [contextId],
  );
}

export function supportSessionOf(context: SupportContext): SupportSession {
  const granted = new Set<string>(context.capabilities);
  return {
    contextId: context.id,
    context,
    can: (capability) => granted.has(capability),
  };
}

/**
 * Mục của không gian "Quản lý xe" (Owner Lite) mở trong phiên — thông tin và ảnh. Mọi mục còn lại
 * (giá, giao nhận, điều khoản, giấy tờ, lịch sử chuyến) nằm ngoài Đợt 1 và bị ẩn hẳn.
 */
const SUPPORT_VEHICLE_SECTIONS: ReadonlySet<VehicleManageSection> = new Set([
  VEHICLE_MANAGE_SECTION.INFORMATION,
  VEHICLE_MANAGE_SECTION.IMAGES,
]);

/** Tab của màn sửa xe (Full Manage) mở trong phiên, kèm capability cần để THẤY tab. */
const SUPPORT_VEHICLE_TABS: Readonly<Partial<Record<VehicleEditTab, SupportCapability>>> = {
  [VEHICLE_EDIT_TAB.INFORMATION]: SUPPORT_CAPABILITY.VEHICLE_VIEW,
  [VEHICLE_EDIT_TAB.MEDIA]: SUPPORT_CAPABILITY.VEHICLE_VIEW,
  [VEHICLE_EDIT_TAB.MAINTENANCE]: SUPPORT_CAPABILITY.MAINTENANCE_VIEW,
};

const PINNED = new Set(SUPPORT_VEHICLE_PINNED_FIELDS);

/** Ngoài phiên: mọi mục đều mở (quyết định thuộc về quyền/cờ gói như trước). */
export function supportAllowsVehicleSection(
  session: SupportSession | null,
  section: VehicleManageSection,
): boolean {
  return session === null || SUPPORT_VEHICLE_SECTIONS.has(section);
}

export function supportAllowsVehicleTab(session: SupportSession | null, tab: string): boolean {
  if (session === null) return true;
  const capability = SUPPORT_VEHICLE_TABS[tab as VehicleEditTab];
  return capability !== undefined && session.can(capability);
}

/**
 * Ô của form xe mà phiên KHÔNG được đổi (chi nhánh, loại xe, dịch vụ, trạng thái vận hành) — khoá
 * ô cho khớp với luật backend (`SUPPORT_VEHICLE_PINNED_FIELDS`), để người hỗ trợ không gõ một
 * thay đổi chắc chắn bị từ chối.
 */
export function useSupportPinnedField(): (field: string) => boolean {
  const session = useSupportSession();
  return (field) => session !== null && PINNED.has(field);
}
