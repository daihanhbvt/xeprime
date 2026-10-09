import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformDriverLicence } from '../types';
import { DriverLicenceReviewDrawer } from './DriverLicenceReviewDrawer';

/**
 * Panel duyệt bằng lái của nền tảng (ADR 0057).
 *
 * Khoá ba điều: Xác thực gửi đúng thông tin ĐÃ ĐỐI CHIẾU (người duyệt sửa được chỗ máy đọc sai);
 * Từ chối bắt buộc chọn MÃ lý do (khách đọc câu tương ứng), lời nhắn chỉ bắt buộc với "khác";
 * và lượt đã có kết quả thì không còn nút quyết định nào.
 */

const detail = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false, isError: false }));
const approve = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const reject = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-admin-driver-licences', () => ({
  usePlatformDriverLicence: () => ({ ...detail, refetch: vi.fn() }),
  usePlatformDriverLicenceImage: () => ({
    data: { url: 'https://r2.test/l.jpg', expiresIn: 120 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useApproveDriverLicence: () => approve,
  useRejectDriverLicence: () => reject,
}));

const PENDING: PlatformDriverLicence = {
  id: 'L1',
  status: 'pending_review',
  kind: 'vn',
  licenceNumber: '790123456789',
  fullName: 'NGUYEN VAN AN',
  dateOfBirth: '1990-04-12',
  classes: ['B2'],
  issuedOn: '2021-03-15',
  expiresOn: '2031-03-15',
  noExpiry: false,
  issuingCountry: 'VN',
  coversCar: true,
  coversMotorbike: false,
  rejectionReason: null,
  reviewNote: null,
  qualityIssues: [],
  canRequestReview: false,
  reviewRequestedAt: null,
  decisionSource: null,
  decidedAt: null,
  submittedAt: '2026-10-08T01:00:00.000Z',
  owner: { id: 'U1', displayName: 'Khách An', phone: '0901234567', email: 'an@xeprime.test' },
  reading: {
    provider: 'tesseract',
    model: 'tesseract.js 7.0.0 · vie best_int',
    confidence: 'low',
    notes: 'Tên bị loá một phần',
    errorCode: null,
    pendingReason: 'low_confidence',
  },
  decidedByName: null,
};

function renderDrawer() {
  return render(
    <App>
      <DriverLicenceReviewDrawer
        id="L1"
        previousId={null}
        nextId="L2"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    </App>,
  );
}

beforeEach(() => {
  detail.data = PENDING;
  approve.mutate.mockReset();
  reject.mutate.mockReset();
});

afterEach(cleanup);

describe('DriverLicenceReviewDrawer', () => {
  it('hiện lý do chờ, ghi chú bộ đọc và suy "lái được" từ hạng', () => {
    renderDrawer();
    expect(screen.getByText('Ảnh chưa đủ chắc chắn')).toBeTruthy();
    expect(screen.getByText('Tên bị loá một phần')).toBeTruthy();
    expect(screen.getByText(/Suy tự động từ hạng: Ô tô/)).toBeTruthy();
  });

  it('Xác thực gửi thông tin đã sửa, hạng tách và viết hoa', async () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText(/Họ tên/), { target: { value: 'NGUYỄN VĂN AN' } });
    fireEvent.change(screen.getByLabelText(/^Hạng/), { target: { value: 'a1, b2' } });
    expect(screen.getByText(/Suy tự động từ hạng: Ô tô · Xe máy/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xác thực' }));
    await waitFor(() => expect(approve.mutate).toHaveBeenCalled());
    expect(approve.mutate.mock.calls[0]![0]).toEqual({
      id: 'L1',
      body: expect.objectContaining({
        kind: 'vn',
        fullName: 'NGUYỄN VĂN AN',
        licenceNumber: '790123456789',
        classes: ['A1', 'B2'],
        expiresOn: '2031-03-15',
        noExpiry: false,
      }),
    });
  });

  it('Từ chối: phải chọn lý do; "khác" bắt buộc lời nhắn; lý do thường thì không', async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    // Tìm theo tiêu đề modal — AntD trong jsdom gán cùng `aria-labelledby` cho panel lẫn modal.
    const heading = await screen.findByText('Từ chối bằng lái', { selector: '.ant-modal-title' });
    const dialog = heading.closest('.ant-modal') as HTMLElement;

    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(await within(dialog).findByText('Chọn một lý do')).toBeTruthy();
    expect(reject.mutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Lý do khác' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(await within(dialog).findByText(/cần một lời nhắn cho khách/)).toBeTruthy();
    expect(reject.mutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Chụp mặt sau' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(reject.mutate).toHaveBeenCalled());
    expect(reject.mutate.mock.calls[0]![0]).toEqual({
      id: 'L1',
      body: { reason: 'back_side', note: null },
    });
  });

  it('lượt đã có kết quả: chỉ đọc, không còn nút quyết định', () => {
    detail.data = {
      ...PENDING,
      status: 'verified',
      decisionSource: 'auto',
      decidedAt: '2026-10-08T01:01:00.000Z',
      reading: { ...PENDING.reading, pendingReason: null },
    };
    renderDrawer();
    expect(screen.getByText('Hệ thống tự động')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác thực' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
  });
});
