'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import {
  SUPPORT_CAPABILITY,
  SUPPORT_VEHICLE_CONDITIONAL_FIELDS,
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
  // ── Đợt 2B: quyền tenant của capability ghi RỘNG hơn capability — các khu dưới đây cùng quyền
  //    nhưng KHÔNG mở cho phiên (backend không khai `@SupportAction`), nên phải ẩn ở màn dùng lại.
  /** Công tắc lên chợ của chủ xe — cùng quyền `vehicles.submit_public` với gửi duyệt. */
  MARKETPLACE_TOGGLE: 'marketplace_toggle',
  /** Ngưng / mở lại / đặt mặc định chi nhánh — cùng quyền `branches.manage` với tạo/sửa chi nhánh. */
  BRANCH_LIFECYCLE: 'branch_lifecycle',
  /** Nhận dạng giấy tờ (OCR — đọc NỘI DUNG file) và lưu trữ giấy tờ. */
  DOCUMENT_PRIVATE: 'document_private',
  /** Giá, giao xe có phí, điều khoản, phụ phí có tài xế trong khu vận hành của xe — tiền và pháp lý. */
  MONEY_TERMS: 'money_terms',
  /** Công tắc tự động nhận chuyến — tự tạo cam kết với khách thay chủ xe. */
  AUTO_ACCEPT: 'auto_accept',
  /** Khoá cả ngày cho mọi xe một lượt (bulk) — không mở cho phiên. */
  BULK_BLOCK: 'bulk_block',
  /**
   * "Lưu & Gửi duyệt" gộp trong một bước ở wizard tạo xe — phiên chỉ tạo NHÁP; gửi duyệt là thao
   * tác riêng, có lý do riêng và xác nhận hai lần.
   */
  CREATE_AND_SUBMIT: 'create_and_submit',
  /**
   * Hình thức nguồn xe (sở hữu / trả góp / thuê lại / hợp tác) — trục tài chính của xe, không nằm
   * trong allowlist tạo xe. Tab "Nguồn xe" ở màn sửa cũng không mở cho phiên.
   */
  VEHICLE_SOURCE: 'vehicle_source',
} as const;

export type SupportHiddenArea = (typeof SUPPORT_HIDDEN_AREA)[keyof typeof SUPPORT_HIDDEN_AREA];

/** Khu `area` có bị ẩn ở màn đang dựng không — `true` chỉ trong một phiên hỗ trợ. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `area` là câu hỏi có tên; mọi khu hiện ẩn như nhau
export function useSupportHides(area: SupportHiddenArea): boolean {
  return useSupportSession() !== null;
}

/**
 * Phiên có capability này không — ngoài phiên luôn `true` (quyết định thuộc về quyền/cờ gói như
 * trước). Dùng cho điều khiển mà quyền tenant không phân biệt được (cùng `vehicles.update` mà một bên
 * đổi khung giờ giao nhận, một bên sửa giá). Server kiểm lại — đây chỉ là hiện/ẩn.
 */
export function useSupportCan(capability: SupportCapability): boolean {
  const session = useSupportSession();
  return session === null || session.can(capability);
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

/**
 * Phiên sửa/gỡ được khoá lịch này không (ADR 0050 §13): chỉ khoá TƯƠNG LAI do CHÍNH phiên đặt —
 * cùng luật với backend (`SUPPORT_BLOCK_NOT_OWNED`). Ngoài phiên: không giới hạn thêm.
 */
export function supportCanTouchBlock(
  session: SupportSession | null,
  block: { supportContextId?: string | null; startAt: string },
): boolean {
  if (session === null) return true;
  return block.supportContextId === session.contextId && Date.parse(block.startAt) > Date.now();
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
 * Mục của không gian "Quản lý xe" (Owner Lite) mở trong phiên, kèm capability cần để THẤY mục.
 * Giá, giao xe có phí, điều khoản, phụ phí, lịch sử chuyến không có ở đây — ẩn hẳn.
 */
const SUPPORT_VEHICLE_SECTIONS: Readonly<Partial<Record<VehicleManageSection, SupportCapability>>> =
  {
    [VEHICLE_MANAGE_SECTION.INFORMATION]: SUPPORT_CAPABILITY.VEHICLE_VIEW,
    [VEHICLE_MANAGE_SECTION.IMAGES]: SUPPORT_CAPABILITY.VEHICLE_VIEW,
    [VEHICLE_MANAGE_SECTION.DOCUMENTS]: SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
    [VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME]: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
    [VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION]: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
    [VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION]: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
  };

/** Tab của màn sửa xe (Full Manage) mở trong phiên, kèm capability cần để THẤY tab. */
const SUPPORT_VEHICLE_TABS: Readonly<Partial<Record<VehicleEditTab, SupportCapability>>> = {
  [VEHICLE_EDIT_TAB.INFORMATION]: SUPPORT_CAPABILITY.VEHICLE_VIEW,
  [VEHICLE_EDIT_TAB.MEDIA]: SUPPORT_CAPABILITY.VEHICLE_VIEW,
  [VEHICLE_EDIT_TAB.MAINTENANCE]: SUPPORT_CAPABILITY.MAINTENANCE_VIEW,
  [VEHICLE_EDIT_TAB.DOCUMENTS]: SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
  [VEHICLE_EDIT_TAB.OPERATIONS]: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
};

const PINNED = new Set(SUPPORT_VEHICLE_PINNED_FIELDS);

/** Ngoài phiên: mọi mục đều mở (quyết định thuộc về quyền/cờ gói như trước). */
export function supportAllowsVehicleSection(
  session: SupportSession | null,
  section: VehicleManageSection,
): boolean {
  if (session === null) return true;
  const capability = SUPPORT_VEHICLE_SECTIONS[section];
  return capability !== undefined && session.can(capability);
}

export function supportAllowsVehicleTab(session: SupportSession | null, tab: string): boolean {
  if (session === null) return true;
  const capability = SUPPORT_VEHICLE_TABS[tab as VehicleEditTab];
  return capability !== undefined && session.can(capability);
}

/**
 * Ô của form xe mà phiên KHÔNG được đổi — khoá ô cho khớp với luật backend: loại xe luôn khoá
 * (`SUPPORT_VEHICLE_PINNED_FIELDS`); chi nhánh / dịch vụ / trạng thái vận hành / giao xe khoá khi
 * phiên THIẾU capability riêng của chúng (`SUPPORT_VEHICLE_CONDITIONAL_FIELDS`, ADR 0050 §13).
 */
export function useSupportPinnedField({ creating = false }: { creating?: boolean } = {}): (
  field: string,
) => boolean {
  const session = useSupportSession();
  return (field) => {
    // Tạo nháp: loại xe / chi nhánh / dịch vụ là dữ liệu KHỞI TẠO trong `SUPPORT_VEHICLE_CREATE_FIELDS`,
    // capability `vehicle.create_draft` đã bao chúng — luật khoá chỉ áp cho lượt SỬA.
    if (session === null || creating) return false;
    if (PINNED.has(field)) return true;
    const capability = SUPPORT_VEHICLE_CONDITIONAL_FIELDS[field];
    return capability !== undefined && !session.can(capability);
  };
}
