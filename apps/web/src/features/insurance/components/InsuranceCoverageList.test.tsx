import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { INSURANCE_COVERAGE_STATUS, INSURANCE_PRODUCT_KIND } from '@xeprime/types';
import viMessages from '../../../../messages/vi';
import type { InsuranceCoverage } from '../types';
import { InsuranceCoverageList } from './InsuranceCoverageList';

/**
 * Khách đã trả `IV`/`IP` phải thấy bảo hiểm đang ở đâu kể cả khi GCN chưa có (ADR 0064) — trước
 * đây chi tiết chuyến chỉ hiện GCN đã cấp, nên một lượt phát hành lỗi hiện ra là… không gì cả.
 */
const ISSUED: InsuranceCoverage = {
  kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
  status: INSURANCE_COVERAGE_STATUS.ISSUED,
  productNameVi: 'Bảo hiểm tai nạn người trên xe MIC',
  productNameEn: 'MIC Personal Accident Protection',
  premiumAmount: '20000',
  certificate: {
    id: 'P2',
    productKind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
    productNameVi: 'Bảo hiểm tai nạn người trên xe MIC',
    productNameEn: 'MIC Personal Accident Protection',
    partnerName: 'MIC (giả lập)',
    certificateNumber: 'TEST-MIC-NNTX-ABCD1234',
    certificateUrl: 'https://staging-cert.mic.vn/view/TEST-MIC-NNTX-ABCD1234',
    coverageFrom: null,
    coverageTo: null,
    isTest: true,
    issuedAt: '2026-10-21T02:00:00.000Z',
  },
};

const FAILED: InsuranceCoverage = {
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  status: INSURANCE_COVERAGE_STATUS.FAILED,
  productNameVi: 'Bảo hiểm vật chất xe MIC',
  productNameEn: 'MIC Auto/Moto Damage Protection',
  premiumAmount: '50000',
  certificate: null,
};

function renderList(coverage: InsuranceCoverage[]) {
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <InsuranceCoverageList coverage={coverage} />
    </NextIntlClientProvider>,
  );
}

describe('InsuranceCoverageList', () => {
  it('lỗi phát hành: hiện tình trạng + lời trấn an, KHÔNG có nút xem GCN', () => {
    renderList([FAILED]);
    expect(screen.getByText('Bảo hiểm vật chất xe MIC')).toBeTruthy();
    expect(screen.getByText('Phát hành lỗi')).toBeTruthy();
    expect(screen.getByText(/XePrime đang xử lý/)).toBeTruthy();
    expect(screen.queryByText('Xem giấy chứng nhận bảo hiểm')).toBeNull();
  });

  it('đã cấp: thẻ GCN có số, nhãn THỬ NGHIỆM và nút xem', () => {
    renderList([FAILED, ISSUED]);
    expect(screen.getByText('TEST-MIC-NNTX-ABCD1234')).toBeTruthy();
    expect(screen.getByText('THỬ NGHIỆM')).toBeTruthy();
    expect(screen.getByText('Xem giấy chứng nhận bảo hiểm')).toBeTruthy();
  });

  it('đang phát hành / chờ phát hành có câu riêng', () => {
    renderList([
      { ...FAILED, status: INSURANCE_COVERAGE_STATUS.ISSUING },
      { ...ISSUED, status: INSURANCE_COVERAGE_STATUS.PENDING_ISSUE, certificate: null },
    ]);
    expect(screen.getByText('Đang phát hành')).toBeTruthy();
    expect(screen.getByText('Chờ phát hành')).toBeTruthy();
  });

  it('không mua bảo hiểm ⇒ không render gì', () => {
    const { container } = renderList([]);
    expect(container.innerHTML).toBe('');
  });
});
