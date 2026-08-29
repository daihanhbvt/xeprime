import { renderHook } from '@testing-library/react';
import { FEATURE_STATE, PLAN_FEATURE } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeature, useFeatureStates, usePlanEndsAt } from './use-feature';

/**
 * Trục NĂNG LỰC ở client (ADR 0027).
 *
 * Bất biến quan trọng nhất — và là thứ dễ làm sai nhất — nằm ở nhánh THIẾU DỮ LIỆU: cache
 * `/auth/me` cũ (từ trước đợt này) hoặc chưa nạp xong phải cho ra "nhìn thấy + ghi được".
 * Khoá nhầm vì một cache chưa kịp làm mới là lấy mất sổ sách của người đang dùng thật; cho qua
 * nhầm chỉ tốn một lần 403 từ server — mà server mới là lớp chặn thật.
 */
const state = vi.hoisted(() => ({
  user: null as { tenant?: { features?: { feature: string; state: string }[]; planEndsAt?: string | null } } | null,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: state.user }),
}));

beforeEach(() => {
  state.user = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useFeature — nhánh thiếu dữ liệu KHÔNG được khoá ai', () => {
  it('chưa đăng nhập / chưa nạp xong ⇒ nhìn thấy + ghi được', () => {
    const { result } = renderHook(() => useFeature(PLAN_FEATURE.FINANCE));

    expect(result.current.state).toBe(FEATURE_STATE.ENABLED);
    expect(result.current.canWrite).toBe(true);
    expect(result.current.isVisible).toBe(true);
  });

  it('cache CŨ (tenant có nhưng thiếu `features`) ⇒ vẫn cho qua', () => {
    state.user = { tenant: {} };
    const { result } = renderHook(() => useFeature(PLAN_FEATURE.DRIVERS));

    expect(result.current.canWrite).toBe(true);
    expect(result.current.isVisible).toBe(true);
  });

  it('backend cũ trả THIẾU một cờ ⇒ cờ đó cho qua, cờ khác vẫn đúng', () => {
    state.user = { tenant: { features: [{ feature: 'finance', state: FEATURE_STATE.HIDDEN }] } };

    const finance = renderHook(() => useFeature(PLAN_FEATURE.FINANCE)).result.current;
    const contracts = renderHook(() => useFeature(PLAN_FEATURE.CONTRACTS)).result.current;

    expect(finance.isVisible).toBe(false);
    expect(contracts.isVisible).toBe(true);
  });
});

describe('useFeature — ba trạng thái (ADR 0027 điều 3)', () => {
  function withState(featureState: string) {
    state.user = {
      tenant: {
        features: [{ feature: 'finance', state: featureState }],
        planEndsAt: '2026-08-01T00:00:00.000Z',
      },
    };
    return renderHook(() => useFeature(PLAN_FEATURE.FINANCE)).result.current;
  }

  it('enabled: thấy và ghi được', () => {
    const access = withState(FEATURE_STATE.ENABLED);
    expect(access.isVisible).toBe(true);
    expect(access.canWrite).toBe(true);
  });

  it('read_only: VẪN thấy, KHÔNG ghi được — và có ngày hết hạn để hiện băng', () => {
    const access = withState(FEATURE_STATE.READ_ONLY);
    expect(access.isVisible).toBe(true);
    expect(access.canWrite).toBe(false);
    expect(access.planEndsAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('hidden: không thấy, không ghi', () => {
    const access = withState(FEATURE_STATE.HIDDEN);
    expect(access.isVisible).toBe(false);
    expect(access.canWrite).toBe(false);
  });
});

describe('useFeatureStates / usePlanEndsAt', () => {
  it('dựng bản đồ cờ → trạng thái; rỗng khi chưa có dữ liệu', () => {
    expect(renderHook(() => useFeatureStates()).result.current).toEqual({});

    state.user = {
      tenant: {
        features: [
          { feature: 'finance', state: FEATURE_STATE.ENABLED },
          { feature: 'debts', state: FEATURE_STATE.READ_ONLY },
        ],
      },
    };
    expect(renderHook(() => useFeatureStates()).result.current).toEqual({
      finance: FEATURE_STATE.ENABLED,
      debts: FEATURE_STATE.READ_ONLY,
    });
  });

  it('planEndsAt null khi không có gói', () => {
    state.user = { tenant: { features: [] } };
    expect(renderHook(() => usePlanEndsAt()).result.current).toBeNull();
  });
});
