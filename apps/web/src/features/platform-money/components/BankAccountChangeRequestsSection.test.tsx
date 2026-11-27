import { App } from 'antd';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import type { PlatformBankAccountChangeRequest } from '../types';
import { BankAccountChangeRequestsSection } from './BankAccountChangeRequestsSection';

/**
 * Hàng đợi xác minh đổi tài khoản (biên bản họp 19/11/2026): người trực thấy số điện thoại để GỌI,
 * tài khoản đang dùng (che) và tài khoản MỚI đầy đủ để đọc cho chủ ví xác nhận. Duyệt bắt buộc ghi
 * cách đã xác minh. Không có yêu cầu ⇒ không chiếm chỗ trên tab Rút tiền.
 */
const state = vi.hoisted(() => ({ items: [] as unknown[] }));
const mutate = vi.hoisted(() => vi.fn());

vi.mock('../hooks/use-platform-money', () => ({
  useBankAccountChangeRequests: () => ({ data: state.items, isFetching: false }),
  useDecideBankAccountChange: () => ({ mutate, isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const REQUEST = {
  id: 'R1',
  bankCode: 'TCB',
  accountNumberMasked: '•••••••7888',
  accountNumber: '19037777888',
  accountName: 'NGUYEN VAN A',
  label: null,
  note: 'Đổi sang tài khoản công ty',
  status: 'pending',
  reviewNote: null,
  reviewedAt: null,
  createdAt: '2026-11-20T03:00:00.000Z',
  ownerType: 'tenant',
  ownerName: 'Hạnh Huế',
  requesterName: 'Nguyễn Văn A',
  requesterPhone: '0905123456',
  requesterEmail: null,
  currentBankCode: 'VCB',
  currentAccountNumberMasked: '•••••••3456',
  currentAccountName: 'NGUYEN VAN A',
} as PlatformBankAccountChangeRequest;

const renderSection = () =>
  renderWithIntl(
    <App>
      <BankAccountChangeRequestsSection />
    </App>,
  );

afterEach(cleanup);

describe('BankAccountChangeRequestsSection', () => {
  it('không có yêu cầu ⇒ không vẽ gì', () => {
    state.items = [];
    const { container } = renderSection();
    expect(container.textContent).toBe('');
  });

  it('một yêu cầu: số để gọi, tài khoản cũ che, tài khoản mới đầy đủ, hai nút quyết định', () => {
    state.items = [REQUEST];
    renderSection();
    expect(screen.getByText('Yêu cầu đổi tài khoản nhận tiền (1)')).toBeTruthy();
    expect(screen.getByRole('link', { name: '0905123456' }).getAttribute('href')).toBe(
      'tel:0905123456',
    );
    expect(screen.getByText(/•••••••3456/)).toBeTruthy();
    expect(screen.getByText(/19037777888/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Duyệt đổi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
  });

  it('bấm Duyệt: hộp thoại đọc lại tài khoản mới và bắt ghi cách xác minh', async () => {
    state.items = [REQUEST];
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt đổi' }));
    expect(await screen.findByText('Duyệt đổi tài khoản nhận tiền')).toBeTruthy();
    expect(screen.getByText(/Tài khoản mới: TCB.*19037777888 - NGUYEN VAN A/)).toBeTruthy();
    expect(screen.getByText('Đã xác minh thế nào')).toBeTruthy();
  });
});
