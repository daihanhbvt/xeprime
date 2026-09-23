import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import {
  API_ERROR_CODE,
  MARKETPLACE_VISIBILITY_REASON,
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';

import type { VehicleDetail } from '../types';
import { MarketplaceVisibilitySwitch } from './MarketplaceVisibilitySwitch';

/**
 * Hàng "Trên chợ" ở cột thao tác đầu hồ sơ xe (ADR 0048).
 *
 * Bộ này khoá hai nhóm quyết định:
 *  - thao tác: bấm lặp khi đang gọi, im lặng khi hỏng, trượt trạng thái trước khi server đồng ý;
 *  - **không vẽ công tắc cho xe chưa duyệt** — một ô mờ ở đó mời người ta bấm rồi không làm gì.
 */
const toggle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-vehicle-mutations', () => ({
  useSetVehicleMarketplaceVisibility: () => toggle,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    App: Object.assign(actual.App, { useApp: () => ({ message: messages }) }),
  };
});

function makeVehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: '01HVEH0000000000000000000',
    code: 'V-000001',
    name: 'Toyota Vios',
    vehicleType: 'car',
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    marketplaceEnabled: true,
    isMarketplaceVisible: true,
    marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.VISIBLE,
    ...over,
  } as unknown as VehicleDetail;
}

function renderSwitch(over: Partial<VehicleDetail> = {}) {
  return render(
    <App>
      <MarketplaceVisibilitySwitch vehicle={makeVehicle(over)} />
    </App>,
  );
}

/** AntD `Switch` là một `<button role="switch">` thật — không phải `<div>` gắn `onClick`. */
const theSwitch = (): HTMLButtonElement => screen.getByRole('switch') as HTMLButtonElement;

beforeEach(() => {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_SUBMIT_PUBLIC]);
  toggle.mutate.mockReset();
  toggle.isPending = false;
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('MarketplaceVisibilitySwitch — xe đã duyệt', () => {
  it('nhãn "Trên chợ" luôn hiện cạnh công tắc, kèm trạng thái "Đang hiển thị"', () => {
    renderSwitch();

    expect(screen.getByText('Trên chợ')).toBeTruthy();
    expect(screen.getByText('Đang hiển thị')).toBeTruthy();
    expect(theSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('đang tắt: trạng thái đọc "Tạm ẩn"', () => {
    renderSwitch({
      marketplaceEnabled: false,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
    });

    expect(screen.getByText('Tạm ẩn')).toBeTruthy();
    expect(theSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('bật nhưng chưa ra được chợ (gian hàng khoá): KHÔNG nói "Đang hiển thị"', () => {
    renderSwitch({
      marketplaceEnabled: true,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE,
    });

    expect(screen.queryByText('Đang hiển thị')).toBeNull();
    expect(screen.getByText('Gian hàng ngừng hoạt động')).toBeTruthy();
  });

  it('bấm tắt → gọi API với false, KHÔNG có modal xác nhận nào chen vào', () => {
    renderSwitch();
    fireEvent.click(theSwitch());

    expect(toggle.mutate).toHaveBeenCalledTimes(1);
    expect(toggle.mutate.mock.calls[0]?.[0]).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('đang gọi API: công tắc loading và KHÔNG nhận cú bấm thứ hai', () => {
    toggle.isPending = true;
    renderSwitch();

    expect(theSwitch().className).toContain('ant-switch-loading');
    fireEvent.click(theSwitch());
    expect(toggle.mutate).not.toHaveBeenCalled();
  });

  it('thành công → toast ngắn, không có lỗi nào', async () => {
    toggle.mutate.mockImplementation((_v: boolean, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderSwitch();
    fireEvent.click(theSwitch());

    await waitFor(() => expect(messages.success).toHaveBeenCalledTimes(1));
    expect(messages.error).not.toHaveBeenCalled();
  });

  it('thất bại → giữ trạng thái cũ, hiện lỗi theo MÃ chứ không theo message tiếng Việt', async () => {
    toggle.mutate.mockImplementation((_v: boolean, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(
        new ApiClientError({
          code: API_ERROR_CODE.SHOP_NOT_ACTIVE,
          message: 'MESSAGE TIẾNG VIỆT CỦA BACKEND — KHÔNG ĐƯỢC HIỆN',
          status: 409,
        }),
      ),
    );
    renderSwitch();
    fireEvent.click(theSwitch());

    await waitFor(() => expect(messages.error).toHaveBeenCalledTimes(1));
    expect(messages.error.mock.calls[0]?.[0]).not.toContain('KHÔNG ĐƯỢC HIỆN');
    // `checked` bám vào bản ghi từ cache — mutation hỏng thì cache không đổi.
    expect(theSwitch().getAttribute('aria-checked')).toBe('true');
    expect(messages.success).not.toHaveBeenCalled();
  });

  it('thiếu quyền: KHÔNG vẽ công tắc, nhưng vẫn nói xe đang ở đâu', () => {
    perms.granted = new Set<string>();
    renderSwitch();

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Đang hiển thị')).toBeTruthy();
  });
});

describe('MarketplaceVisibilitySwitch — xe chưa duyệt thì không có công tắc', () => {
  it.each([
    [VEHICLE_PUBLIC_STATUS.DRAFT, 'Chưa hiển thị'],
    [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW, 'Đang chờ duyệt'],
    [VEHICLE_PUBLIC_STATUS.NEEDS_REVISION, 'Cần bổ sung'],
    [VEHICLE_PUBLIC_STATUS.REJECTED, 'Không được duyệt'],
    [VEHICLE_PUBLIC_STATUS.HIDDEN, 'Bị nền tảng ẩn'],
    [VEHICLE_PUBLIC_STATUS.ARCHIVED, 'Đã lưu trữ'],
  ])('%s → thẻ trạng thái "%s", không có công tắc mờ nào', (publicStatus, label) => {
    renderSwitch({
      publicStatus,
      marketplaceEnabled: true,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: MARKETPLACE_VISIBILITY_REASON.NOT_APPROVED,
    });

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Trên chợ')).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('MarketplaceVisibilitySwitch — khả truy cập', () => {
  it('là một <button> thật (nhận focus, bàn phím dùng được), aria-label mang tên xe', () => {
    renderSwitch();
    const el = theSwitch();

    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('aria-label')).toContain('Toyota Vios');

    el.focus();
    expect(document.activeElement).toBe(el);
  });

  it('phần giải thích dài nằm sau dấu "i", không đổ ra màn hình chính', () => {
    renderSwitch();
    expect(screen.getByRole('button', { name: /Giải thích về công tắc hiển thị/ })).toBeTruthy();
  });
});
