import { App } from 'antd';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SELLER_ENTITY_TYPE, TAX_WITHHOLDING_STATUS } from '@xeprime/types';
import { TaxPeriodPanel } from './TaxPeriodPanel';
import type { TaxPeriodSummary, TaxRow } from '../types';

/**
 * Sổ thuế theo kỳ — Phase 8.
 *
 * Ba điều test này khoá, và mỗi cái tương ứng một cách đọc sai một tờ khai:
 *
 *  1. **Nhóm `unknown` hiện ra kèm CẢNH BÁO**, không bị gộp vào "cá nhân". Gộp là đoán hộ một
 *     nghĩa vụ pháp lý, và con số sai sẽ nằm im trong tờ khai đã gửi.
 *  2. **Bút toán ĐẢO đọc được là âm** — nếu nó trông như một số dương nhỏ thì người đọc sẽ tưởng
 *     kỳ này có thêm nghĩa vụ chứ không phải vừa bị sửa.
 *  3. **Dòng đã NỘP không cho đảo.** Tiền đã rời tài khoản; sửa bằng nút trên màn hình là ghi
 *     lại một con số đã gửi cho cơ quan thuế.
 */
const summary = vi.hoisted(() => ({
  data: undefined as TaxPeriodSummary | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const rows = vi.hoisted(() => ({
  data: undefined as { data: TaxRow[]; meta: unknown } | undefined,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-tax', () => ({
  useTaxPeriodSummary: () => summary,
  useTaxRows: () => rows,
  useMarkPeriodDeclared: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkPeriodRemitted: () => ({ mutate: vi.fn(), isPending: false }),
  useReverseTaxRow: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function makeSummary(over: Partial<TaxPeriodSummary> = {}): TaxPeriodSummary {
  return {
    periodKey: '2026-09',
    totalAmount: '140000',
    totalTaxableBase: '1400000',
    rows: 1,
    accruedAmount: '140000',
    declaredAmount: '0',
    remittedAmount: '0',
    byEntityType: [
      { entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS, amount: '140000', rows: 1 },
    ],
    byTenant: [
      {
        tenantId: '01TENANT',
        tenantName: 'Gian hàng A',
        entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
        taxCode: 'TX123',
        amount: '140000',
        rows: 1,
      },
    ],
    ...over,
  } as TaxPeriodSummary;
}

function makeRow(over: Partial<TaxRow> = {}): TaxRow {
  return {
    id: '01TAXROW',
    bookingId: '01BOOKING',
    bookingCode: 'DH000001',
    tenantId: '01TENANT',
    tenantName: 'Gian hàng A',
    entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
    taxCode: 'TX123',
    taxableBase: '1400000',
    percent: 10,
    label: 'VAT 5% + TNCN 5%',
    amount: '140000',
    status: TAX_WITHHOLDING_STATUS.ACCRUED,
    periodKey: '2026-09',
    accruedAt: '2026-09-10T03:00:00.000Z',
    declaredAt: null,
    remittedAt: null,
    reversalOfId: null,
    reversalReason: null,
    ...over,
  } as TaxRow;
}

function renderPanel() {
  return render(
    <App>
      <TaxPeriodPanel />
    </App>,
  );
}

beforeEach(() => {
  summary.data = makeSummary();
  summary.isError = false;
  rows.data = { data: [makeRow()], meta: { page: 1, limit: 20, total: 1, hasNext: false } };
  rows.isError = false;
});

describe('TaxPeriodPanel', () => {
  it('hiện bốn con số của kỳ và phần chia theo loại chủ thể', () => {
    renderPanel();

    expect(screen.getByText('Tổng nghĩa vụ kỳ')).toBeTruthy();
    expect(screen.getByText('Chia theo loại chủ thể')).toBeTruthy();
    expect(screen.getAllByText(/Hộ kinh doanh/).length).toBeGreaterThan(0);
  });

  it('gian hàng CHƯA khai hồ sơ: hiện riêng + cảnh báo, không gộp vào cá nhân', () => {
    summary.data = makeSummary({
      byEntityType: [
        { entityType: SELLER_ENTITY_TYPE.INDIVIDUAL, amount: '100000', rows: 1 },
        { entityType: 'unknown', amount: '40000', rows: 1 },
      ],
    });
    renderPanel();

    expect(screen.getAllByText('Chưa khai hồ sơ').length).toBeGreaterThan(0);
    const alert = document.querySelector('.ant-alert-warning') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(within(alert).getByText(/chưa khai hồ sơ người bán/i)).toBeTruthy();
  });

  it('nhóm `unknown` bằng 0 thì KHÔNG cảnh báo — không làm ồn khi không có việc', () => {
    summary.data = makeSummary({
      byEntityType: [{ entityType: 'unknown', amount: '0', rows: 0 }],
    });
    renderPanel();
    expect(document.querySelector('.ant-alert-warning')).toBeNull();
  });

  it('bút toán ĐẢO hiện số âm, và KHÔNG cho đảo lần nữa', () => {
    rows.data = {
      data: [makeRow({ id: '01REV', amount: '-140000', reversalOfId: '01TAXROW', status: TAX_WITHHOLDING_STATUS.REVERSED, reversalReason: 'Sai tỷ lệ' })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPanel();

    // `fmt.money` in dấu trừ — đó là tín hiệu mang nghĩa, không phải màu.
    expect(screen.getByText(/-140[.,]000/)).toBeTruthy();
    expect(screen.getByText('Sai tỷ lệ')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đảo' })).toHaveProperty('disabled', true);
  });

  it('dòng ĐÃ NỘP không cho đảo — sửa bằng tờ khai điều chỉnh', () => {
    rows.data = {
      data: [makeRow({ status: TAX_WITHHOLDING_STATUS.REMITTED, remittedAt: '2026-10-01T00:00:00.000Z' })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPanel();
    expect(screen.getByRole('button', { name: 'Đảo' })).toHaveProperty('disabled', true);
  });

  it('dòng CHỜ KÊ KHAI cho đảo, và modal đòi LÝ DO đủ dài trước khi bấm được', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Đảo' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Đảo' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Đảo một dòng thuế')).toBeTruthy();

    /*
     * Lý do là BẮT BUỘC: một khoản thuế biến mất khỏi sổ mà không ai giải thích là thứ kiểm toán
     * sẽ hỏi đúng một lần và không ai trả lời được. Nút xác nhận phải mờ tới khi có lý do thật —
     * server cũng chặn (`@MinLength(5)`), nhưng mời người dùng bấm một thứ chắc chắn hỏng là tệ.
     */
    const confirm = within(dialog).getByRole('button', { name: 'Đảo' });
    expect(confirm).toHaveProperty('disabled', true);

    fireEvent.change(within(dialog).getByLabelText('Lý do đảo'), {
      target: { value: 'Sai tỷ lệ cho hộ kinh doanh' },
    });
    expect(confirm).toHaveProperty('disabled', false);
  });
});
