import { cleanup, fireEvent, screen } from '@testing-library/react';
import { FEATURE_STATE } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { PlanFeatureList } from './PlanFeatureList';

/**
 * "Nâng cấp được thêm gì" (ADR 0027 §Hệ quả) — chỗ bán hàng của màn "Gói & hoá đơn".
 *
 * Điều được khoá: danh sách viết bằng NGÔN NGỮ NGƯỜI DÙNG (không phải khoá cờ), `read_only`
 * phải phân biệt được với `hidden` — người dùng cần biết sổ cũ vẫn còn, không phải đã mất — và
 * (16/09/2026) thẻ chỉ nói về thứ CHƯA có: không còn cột dấu tích liệt kê thứ họ đã mua, và
 * không mời bấm mua khi người xem không có `subscription.purchase`.
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
  it('không còn gì bị khoá ⇒ thẻ biến mất, không hiện một dòng tự khen', () => {
    const { container } = renderWithIntl(<PlanFeatureList onUpgrade={vi.fn()} />);

    // Cache rỗng = coi như mở hết (mặc định "không khoá ai" của `useFeature`).
    expect(container.textContent).toBe('');
  });

  it('chỉ liệt kê thứ CHƯA có, nhãn là chữ người dùng chứ không phải khoá cờ', () => {
    features.states = {
      finance: FEATURE_STATE.ENABLED,
      drivers: FEATURE_STATE.HIDDEN,
      contracts: FEATURE_STATE.HIDDEN,
    };
    renderWithIntl(<PlanFeatureList onUpgrade={vi.fn()} />);

    expect(screen.getByText('Nâng cấp để mở thêm')).toBeTruthy();
    expect(screen.getByText('Quản lý tài xế')).toBeTruthy();
    // Thứ ĐANG mở không được liệt kê lại: người dùng biết họ đang có nó.
    expect(screen.queryByText('Sổ thu chi và báo cáo')).toBeNull();
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

  /*
   * Không có `subscription.purchase` (điển hình: `shop_manager`) ⇒ `SubscriptionWorkspace` không
   * truyền `onUpgrade`. Danh sách VẪN hiện — họ cần biết vì sao một mục menu vắng mặt — nhưng
   * không có nút nào mời họ đi vào luồng mà API sẽ trả 403.
   */
  it('không có quyền mua ⇒ vẫn liệt kê tính năng khoá, nhưng KHÔNG có nút mua', () => {
    features.states = { drivers: FEATURE_STATE.HIDDEN };
    renderWithIntl(<PlanFeatureList />);

    expect(screen.getByText('Quản lý tài xế')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xem gói cao hơn/ })).toBeNull();
  });
});
