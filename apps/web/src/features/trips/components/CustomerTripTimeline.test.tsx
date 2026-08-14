import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CUSTOMER_TRIP_STAGE,
  CUSTOMER_TRIP_STAGE_VALUES,
  customerTripTimeline,
  type CustomerTripStage,
} from '@xeprime/types';

import { CustomerTripTimeline } from './CustomerTripTimeline';

/**
 * Dòng thời gian của khách — điều phải giữ bằng mọi giá: **đúng hai mốc**, một hàng ngang.
 *
 * Test đi qua TOÀN BỘ chặng thật (không chỉ vài chặng được chọn) vì thứ dễ hỏng nhất ở đây là
 * ai đó thêm `Đã giao xe` thành mốc thứ ba khi mở rộng vòng đời — typecheck sẽ không nói gì.
 */
afterEach(cleanup);

function renderFor(stage: CustomerTripStage) {
  const state = customerTripTimeline(stage);
  return render(
    <CustomerTripTimeline
      confirmedDone={state.confirmedDone}
      completedDone={state.completedDone}
    />,
  );
}

describe('CustomerTripTimeline', () => {
  it('luôn dựng đúng hai mốc, với mọi chặng dựng được', () => {
    for (const stage of CUSTOMER_TRIP_STAGE_VALUES) {
      if (!customerTripTimeline(stage).visible) continue;
      const { unmount } = renderFor(stage);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByText('Đã xác nhận')).toBeTruthy();
      expect(screen.getByText('Hoàn thành')).toBeTruthy();
      // Không có mốc thứ ba nào len vào theo tiến trình vận hành.
      expect(screen.queryByText(/Đã giao/i)).toBeNull();
      expect(screen.queryByText(/Đang thuê/i)).toBeNull();
      unmount();
    }
  });

  it('chặng Đang thuê dùng CÙNG dòng thời gian với Sẵn sàng', () => {
    const ready = customerTripTimeline(CUSTOMER_TRIP_STAGE.READY);
    const active = customerTripTimeline(CUSTOMER_TRIP_STAGE.ACTIVE);
    expect(active).toEqual(ready);
  });

  it('mốc chưa xong đọc được là chưa xong (không chỉ dựa vào màu)', () => {
    renderFor(CUSTOMER_TRIP_STAGE.ACTIVE);
    const label = screen.getByLabelText(/Tiến trình chuyến/);
    expect(label.textContent).toContain('Đã xác nhận');
    expect(label.textContent).toContain('chưa hoàn thành');
  });

  it('hoàn thành đóng cả hai mốc', () => {
    renderFor(CUSTOMER_TRIP_STAGE.COMPLETED);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.textContent?.includes('đã xong'))).toBe(true);
  });

  /**
   * jsdom không tính layout nên không đo được "có xuống dòng không". Khoá ở tầng KHAI BÁO thay
   * vì bỏ qua: `flex-wrap` là dòng CSS duy nhất có thể biến hai mốc thành hai hàng ở 390px, và
   * nó rất dễ bị thêm vào một cách vô tình khi ai đó sửa khoảng cách.
   */
  it('CSS không chứa `flex-wrap` — hai mốc luôn ở một hàng, kể cả 390px', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, 'CustomerTripTimeline.module.css'), 'utf8');
    // Bỏ chú thích trước khi soi: điều bị cấm là KHAI BÁO `flex-wrap`, còn đoạn văn giải thích
    // vì sao nó bị cấm thì đương nhiên phải nhắc tên nó.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(declarations).not.toMatch(/flex-wrap/);
    // Và chỉ được gãy ở đúng breakpoint chuẩn của dự án (quyết định P8).
    for (const [, value] of declarations.matchAll(/max-width:\s*(\d+)px/g)) {
      expect([640, 1024, 1440]).toContain(Number(value));
    }
  });
});
