import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SUPPORT_CAPABILITY, SUPPORT_MODE, type SupportCapability } from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import { VEHICLE_EDIT_TAB, VEHICLE_MANAGE_SECTION } from '@/constants/routes';
import {
  SupportSessionScope,
  supportAllowsVehicleSection,
  supportAllowsVehicleTab,
  supportCanTouchBlock,
  supportSessionOf,
  useSupportCan,
  useSupportPinnedField,
} from './support-session';
import { CONTEXT_A, supportContextFixture } from './test-utils';

/**
 * Luật hiện/ẩn của phiên hỗ trợ ở màn dùng lại (ADR 0050 §13) — khớp với luật backend.
 */
function sessionWith(capabilities: SupportCapability[]) {
  return supportSessionOf(supportContextFixture({ capabilities, mode: SUPPORT_MODE.ASSIST }));
}

function wrapperFor(capabilities: SupportCapability[] | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return capabilities === null ? (
      <>{children}</>
    ) : (
      <SupportSessionScope session={sessionWith(capabilities)}>{children}</SupportSessionScope>
    );
  };
}

describe('useSupportPinnedField — trường có điều kiện', () => {
  it('ngoài phiên: không khoá ô nào', () => {
    const { result } = renderHook(() => useSupportPinnedField(), { wrapper: wrapperFor(null) });
    expect(result.current('branchId')).toBe(false);
    expect(result.current('vehicleType')).toBe(false);
  });

  it('loại xe luôn khoá; chi nhánh/dịch vụ chỉ mở khi có đúng capability', () => {
    const without = renderHook(() => useSupportPinnedField(), {
      wrapper: wrapperFor([SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT]),
    });
    expect(without.result.current('vehicleType')).toBe(true);
    expect(without.result.current('branchId')).toBe(true);
    expect(without.result.current('serviceTypes')).toBe(true);
    expect(without.result.current('name')).toBe(false);

    const withCaps = renderHook(() => useSupportPinnedField(), {
      wrapper: wrapperFor([
        SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
        SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN,
        SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
      ]),
    });
    expect(withCaps.result.current('vehicleType')).toBe(true);
    expect(withCaps.result.current('branchId')).toBe(false);
    expect(withCaps.result.current('serviceTypes')).toBe(false);
    expect(withCaps.result.current('operationStatus')).toBe(false);
  });

  it('wizard TẠO nháp: không khoá ô khởi tạo (loại xe, chi nhánh, dịch vụ)', () => {
    const { result } = renderHook(() => useSupportPinnedField({ creating: true }), {
      wrapper: wrapperFor([SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT]),
    });
    expect(result.current('vehicleType')).toBe(false);
    expect(result.current('branchId')).toBe(false);
    expect(result.current('serviceTypes')).toBe(false);
  });
});

describe('mục / tab của xe theo capability', () => {
  it('giấy tờ và vận hành chỉ hiện khi phiên có capability tương ứng', () => {
    const view = sessionWith([SUPPORT_CAPABILITY.VEHICLE_VIEW]);
    expect(supportAllowsVehicleSection(view, VEHICLE_MANAGE_SECTION.DOCUMENTS)).toBe(false);
    expect(supportAllowsVehicleTab(view, VEHICLE_EDIT_TAB.OPERATIONS)).toBe(false);

    const assist = sessionWith([
      SUPPORT_CAPABILITY.VEHICLE_VIEW,
      SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
      SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
    ]);
    expect(supportAllowsVehicleSection(assist, VEHICLE_MANAGE_SECTION.DOCUMENTS)).toBe(true);
    expect(
      supportAllowsVehicleSection(assist, VEHICLE_MANAGE_SECTION.HANDOVER_TIME),
    ).toBe(true);
    expect(supportAllowsVehicleTab(assist, VEHICLE_EDIT_TAB.DOCUMENTS)).toBe(true);
    expect(supportAllowsVehicleTab(assist, VEHICLE_EDIT_TAB.OPERATIONS)).toBe(true);
  });

  it('giá, giao xe có phí, điều khoản, phụ phí: không bao giờ hiện trong phiên', () => {
    const all = sessionWith([
      SUPPORT_CAPABILITY.VEHICLE_VIEW,
      SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
      SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
      SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
    ]);
    for (const section of [
      // Giá & chính sách gồm cả giao xe có phí và cọc — khu TIỀN, không mở trong phiên.
      VEHICLE_MANAGE_SECTION.PRICING,
      VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
      VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
    ]) {
      expect(supportAllowsVehicleSection(all, section)).toBe(false);
    }
    expect(supportAllowsVehicleTab(all, VEHICLE_EDIT_TAB.PRICING)).toBe(false);
    expect(supportAllowsVehicleTab(all, VEHICLE_EDIT_TAB.SOURCE)).toBe(false);
  });
});

describe('supportCanTouchBlock — khoá lịch của chính phiên', () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const past = new Date(Date.now() - 86400_000).toISOString();
  const session = sessionWith([SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE]);

  it('ngoài phiên: không giới hạn thêm', () => {
    expect(supportCanTouchBlock(null, { supportContextId: null, startAt: past })).toBe(true);
  });

  it('chỉ khoá TƯƠNG LAI do chính phiên đặt', () => {
    expect(supportCanTouchBlock(session, { supportContextId: CONTEXT_A, startAt: future })).toBe(
      true,
    );
    expect(supportCanTouchBlock(session, { supportContextId: CONTEXT_A, startAt: past })).toBe(
      false,
    );
    expect(supportCanTouchBlock(session, { supportContextId: null, startAt: future })).toBe(false);
    expect(supportCanTouchBlock(session, { supportContextId: 'KHAC', startAt: future })).toBe(
      false,
    );
  });
});

describe('useSupportCan', () => {
  it('ngoài phiên luôn true; trong phiên theo capability', () => {
    expect(
      renderHook(() => useSupportCan(SUPPORT_CAPABILITY.LISTING_REPAIR), {
        wrapper: wrapperFor(null),
      }).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useSupportCan(SUPPORT_CAPABILITY.LISTING_REPAIR), {
        wrapper: wrapperFor([SUPPORT_CAPABILITY.VEHICLE_VIEW]),
      }).result.current,
    ).toBe(false);
  });
});
