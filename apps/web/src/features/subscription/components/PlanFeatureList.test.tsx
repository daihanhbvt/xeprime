import { cleanup, fireEvent, screen } from '@testing-library/react';
import { FEATURE_STATE } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { PlanFeatureList } from './PlanFeatureList';

/**
 * "Nâng cấp được thêm gì" (ADR 0027 §Hệ quả) — chỗ bán hàng của màn "Gói của tôi".
 *
 * Điều được khoá: danh sách viết bằng NGÔN NGỮ NGƯỜI DÙNG (không phải khoá cờ), và `read_only`
 * phải phân biệt được với `hidden` — người dùng cần biết sổ cũ vẫn còn, không phải đã mất.
 */
const features = vi.hoisted(() => ({ states: {} as Record<string, string> }));

vi.mock('@/hooks/use-feature', () => ({
  useFeatureStates: () => features.states,
}));

beforeEach(() => {
  features.states = {};
});

afterEach(cleanup);

describe('PlanFeatureList', () => {
  it('cache rỗng ⇒ coi như đã mở hết, không doạ ai bằng danh sách khoá', () => {
    renderWithIntl(<PlanFeatureList onUpgrade={vi.fn()} />);

    expect(screen.getByText(/đã mở toàn bộ tính năng nâng cao/)).toBeTruthy();
  });

  it('tách hai cột: đang mở vs nâng cấp để mở thêm, nhãn là chữ người dùng', () => {
    features.states = {
      finance: FEATURE_STATE.ENABLED,
      drivers: FEATURE_STATE.HIDDEN,
      contracts: FEATURE_STATE.HIDDEN,
      debts: FEATURE_STATE.HIDDEN,
      maintenance: FEATURE_STATE.HIDDEN,
      members: FEATURE_STATE.HIDDEN,
      branches: FEATURE_STATE.HIDDEN,
      escrow_hold: FEATURE_STATE.HIDDEN,
    };
    renderWithIntl(<PlanFeatureList onUpgrade={vi.fn()} />);

    expect(screen.getByText('Gói hiện tại đang mở')).toBeTruthy();
    expect(screen.getByText('Nâng cấp để mở thêm')).toBeTruthy();
    // Nhãn nghiệp vụ, KHÔNG phải khoá cờ `finance`/`drivers`.
    expect(screen.getByText('Sổ thu chi và báo cáo')).toBeTruthy();
    expect(screen.getByText('Quản lý tài xế')).toBeTruthy();
  });

  it('read_only nằm ở cột nâng cấp NHƯNG có ghi chú "đang chỉ xem"', () => {
    features.states = { finance: FEATURE_STATE.READ_ONLY, drivers: FEATURE_STATE.HIDDEN };
    renderWithIntl(<PlanFeatureList onUpgrade={vi.fn()} />);

    expect(screen.getByText(/đang chỉ xem/)).toBeTruthy();
  });

  it('nút nâng cấp mở modal mua gói, không điều hướng về chính trang đang đứng', () => {
    features.states = { drivers: FEATURE_STATE.HIDDEN };
    const onUpgrade = vi.fn();
    renderWithIntl(<PlanFeatureList onUpgrade={onUpgrade} />);

    fireEvent.click(screen.getByRole('button', { name: /Xem gói cao hơn/ }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
