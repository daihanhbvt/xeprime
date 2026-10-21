import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PLAN_QUOTA_GATE_KIND,
  PLAN_QUOTA_GATE_POINT,
  PLAN_QUOTA_GATE_SOURCE,
} from '../plan-quota-gate';
import { PlanQuotaGateAlert } from './PlanQuotaGateAlert';

/**
 * Dải lỗi "gói chưa cho phép" ở màn xe (ADR 0065): câu nói ĐÚNG loại xe + con số, nút dẫn tới
 * ĐÚNG làn gói. Câu chung "Gói dịch vụ hiện tại đã đạt giới hạn." không nói được loại nào bị chặn.
 */
afterEach(cleanup);

describe('PlanQuotaGateAlert', () => {
  it('chưa có gói xe máy ⇒ câu nói xe máy + nút "Mua gói xe máy" tới làn xe máy', () => {
    render(
      <PlanQuotaGateAlert
        gate={{ kind: PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED, vehicleType: 'motorbike' }}
      />,
    );

    expect(screen.getByText(/chưa có gói xe máy/)).toBeTruthy();
    const cta = screen.getByRole('link', { name: 'Mua gói xe máy' });
    expect(cta.getAttribute('href')).toContain('lane=motorbike');
  });

  it('hết suất ô tô trên chợ ⇒ con số + "Nâng gói ô tô"', () => {
    render(
      <PlanQuotaGateAlert
        gate={{
          kind: PLAN_QUOTA_GATE_KIND.LIMIT_REACHED,
          vehicleType: 'car',
          point: PLAN_QUOTA_GATE_POINT.MARKETPLACE,
          source: PLAN_QUOTA_GATE_SOURCE.LANE_PLAN,
          used: 5,
          limit: 5,
        }}
      />,
    );

    expect(screen.getByText(/Gói ô tô đã dùng hết 5\/5 suất trên chợ/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nâng gói ô tô' }).getAttribute('href')).toContain(
      'lane=car',
    );
  });

  it('Owner Lite ⇒ mời nâng cấp lên gian hàng', () => {
    render(
      <PlanQuotaGateAlert
        gate={{
          kind: PLAN_QUOTA_GATE_KIND.LIMIT_REACHED,
          vehicleType: 'car',
          point: PLAN_QUOTA_GATE_POINT.FLEET,
          source: PLAN_QUOTA_GATE_SOURCE.OWNER_LITE,
          used: 3,
          limit: 3,
        }}
      />,
    );

    expect(screen.getByText(/đăng tối đa 3 xe/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nâng cấp lên gian hàng' })).toBeTruthy();
  });
});
