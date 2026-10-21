import { App } from 'antd';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSURANCE_POLICY_STATUS, INSURANCE_QUEUE_STATUS_ANY } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { CertificateFilters } from '../types';
import { InsuranceCertificatesPanel } from './InsuranceCertificatesPanel';

/**
 * Hàng đợi GCN — "Cần xử lý ↔ Tất cả" là GÓC NHÌN (`QueueViewSwitch`), không phải bộ lọc:
 *  - mặc định (không `status`) là hàng đợi lỗi, KHÔNG có ô lọc trạng thái;
 *  - chuyển sang "Tất cả" ghi `status = any` lên URL;
 *  - ở "Tất cả", ô lọc trạng thái hiện ra và lọc TRONG góc nhìn đó.
 */
const state = vi.hoisted(() => ({
  filters: {} as CertificateFilters,
  setFilters: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useCertificateFilters: () => ({ filters: state.filters, setFilters: state.setFilters }),
  useCertificates: () => ({
    data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useCertificateDetail: () => ({ data: undefined, isLoading: false, isError: false }),
  useRetryCertificate: () => ({ mutate: vi.fn(), isPending: false }),
  useVoidCertificate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function renderPanel() {
  return renderWithIntl(
    <App>
      <InsuranceCertificatesPanel />
    </App>,
  );
}

beforeEach(() => {
  state.filters = {};
  state.setFilters.mockReset();
});

afterEach(cleanup);

describe('InsuranceCertificatesPanel — góc nhìn', () => {
  it('mặc định "Cần xử lý": có gợi ý hàng đợi lỗi, không có ô lọc trạng thái', () => {
    renderPanel();
    expect(screen.getByText(/Đang xem hợp đồng LỖI/)).toBeTruthy();
    expect(screen.queryByText('Trạng thái')).toBeNull();
    expect(screen.getByText('Không có hợp đồng nào cần xử lý')).toBeTruthy();
  });

  it('chuyển sang "Tất cả" ⇒ ghi status = any', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Tất cả'));
    expect(state.setFilters).toHaveBeenCalledWith({ status: INSURANCE_QUEUE_STATUS_ANY });
  });

  it('ở "Tất cả": có ô lọc trạng thái, rỗng nói đúng góc nhìn', () => {
    state.filters = { status: INSURANCE_QUEUE_STATUS_ANY };
    renderPanel();
    expect(screen.queryByText(/Đang xem hợp đồng LỖI/)).toBeNull();
    expect(screen.getAllByText('Trạng thái').length).toBeGreaterThan(0);
    expect(screen.getByText('Chưa có hợp đồng bảo hiểm nào')).toBeTruthy();
  });

  it('lọc một trạng thái cụ thể vẫn ở góc nhìn "Tất cả", quay về "Cần xử lý" bỏ trạng thái', () => {
    state.filters = { status: INSURANCE_POLICY_STATUS.ISSUED };
    renderPanel();
    expect(screen.queryByText(/Đang xem hợp đồng LỖI/)).toBeNull();
    fireEvent.click(screen.getByText('Cần xử lý'));
    expect(state.setFilters).toHaveBeenCalledWith({ status: undefined });
  });
});
