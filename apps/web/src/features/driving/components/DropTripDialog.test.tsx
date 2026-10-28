import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVER_DROP_REASON } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import { DropTripDialog } from './DropTripDialog';

/**
 * Hộp "Báo sự cố / Rút khỏi chuyến" của tài xế (ADR 0074): báo trước hệ quả theo độ sát giờ (cùng
 * `driverDropPolicy` của server), `other` bắt buộc mô tả, gửi đúng body.
 */
const drop = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
}));
vi.mock('../hooks', () => ({ useDropDriverTrip: () => drop }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const HOUR = 3_600_000;

function trip(pickupInHours: number, releaseUntil: string | null = null) {
  return {
    id: 'bk-1',
    code: 'DH-0001',
    pickupAt: new Date(Date.now() + pickupInHours * HOUR).toISOString(),
    releaseUntil,
  };
}

beforeEach(() => {
  drop.mutate.mockReset();
});
afterEach(cleanup);

describe('DropTripDialog', () => {
  it('sát giờ ⇒ báo cooldown 48 giờ; còn xa ⇒ vi phạm nhẹ; trong cửa sổ trả lại ⇒ không phạt', () => {
    const { unmount } = renderWithIntl(<DropTripDialog trip={trip(1)} open onClose={vi.fn()} />);
    expect(screen.getByText(/trong 48 giờ/)).toBeTruthy();
    unmount();

    const far = renderWithIntl(<DropTripDialog trip={trip(30)} open onClose={vi.fn()} />);
    expect(screen.getByText(/vi phạm nhẹ/)).toBeTruthy();
    far.unmount();

    renderWithIntl(
      <DropTripDialog
        trip={trip(5, new Date(Date.now() + HOUR).toISOString())}
        open
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/không bị ghi vi phạm/)).toBeTruthy();
  });

  it('chọn "Lý do khác" mà mô tả quá ngắn ⇒ lỗi ở form, không gọi server', async () => {
    renderWithIntl(<DropTripDialog trip={trip(30)} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Lý do khác'));
    fireEvent.change(screen.getByLabelText(/Mô tả sự cố/), { target: { value: 'ngắn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận rút khỏi chuyến' }));
    expect(await screen.findByText('Mô tả sự cố ít nhất 10 ký tự')).toBeTruthy();
    expect(drop.mutate).not.toHaveBeenCalled();
  });

  it('gửi nhóm lý do + mô tả đã cắt khoảng trắng', async () => {
    renderWithIntl(<DropTripDialog trip={trip(30)} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Việc gia đình khẩn cấp'));
    fireEvent.change(screen.getByLabelText(/Mô tả sự cố/), { target: { value: '  Người nhà nhập viện ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận rút khỏi chuyến' }));
    await waitFor(() => expect(drop.mutate).toHaveBeenCalledTimes(1));
    expect((drop.mutate.mock.calls[0] as unknown[])[0]).toEqual({
      id: 'bk-1',
      body: { reasonCategory: DRIVER_DROP_REASON.FAMILY_EMERGENCY, reason: 'Người nhà nhập viện' },
    });
  });
});
