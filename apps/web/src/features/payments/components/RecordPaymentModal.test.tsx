import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordPaymentModal } from './RecordPaymentModal';

const record = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-payments', () => ({
  useRecordPayment: () => record,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function renderModal(debtAmount = '580000') {
  return render(
    <App>
      <RecordPaymentModal
        bookingId="booking-1"
        debtAmount={debtAmount}
        open
        onClose={vi.fn()}
      />
    </App>,
  );
}

beforeEach(() => {
  record.mutate.mockReset();
  record.isPending = false;
});

afterEach(cleanup);

describe('RecordPaymentModal', () => {
  it('mặc định điền toàn bộ số tiền còn nợ và định dạng dấu chấm hàng nghìn', () => {
    renderModal();

    expect(screen.getByLabelText<HTMLInputElement>('Số tiền nhận').value).toBe('580.000');
  });

  it('cập nhật số gợi ý khi chuyển sang đơn có công nợ khác', async () => {
    const view = renderModal();

    view.rerender(
      <App>
        <RecordPaymentModal
          bookingId="booking-2"
          debtAmount="1250000"
          open
          onClose={vi.fn()}
        />
      </App>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Số tiền nhận').value).toBe('1.250.000'),
    );
  });

  it('gửi giá trị số thô qua API, không gửi chuỗi đã phân nhóm', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));

    await waitFor(() => expect(record.mutate).toHaveBeenCalledTimes(1));
    expect(record.mutate.mock.calls[0]![0]).toMatchObject({ amount: '580000', method: 'cash' });
  });
});
