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

/** Kỳ mà panel thật sự hỏi — đọc từ URL, không từ state cục bộ. */
const asked = vi.hoisted(() => ({
  summary: [] as string[],
  rows: [] as { period: string; page: number }[],
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin/money',
  useSearchParams: () => nav.params,
}));

vi.mock('../hooks/use-tax', () => ({
  useTaxPeriodSummary: (period: string) => {
    asked.summary.push(period);
    return summary;
  },
  useTaxRows: (query: { period: string; page: number }) => {
    asked.rows.push(query);
    return rows;
  },
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
    totalVatAmount: '0',
    totalPitAmount: '0',
    // Dòng mẫu là dòng một-mức cũ — cả tổng nằm ở phần chưa tách.
    totalUnsplitAmount: '140000',
    rows: 1,
    accruedAmount: '140000',
    declaredAmount: '0',
    remittedAmount: '0',
    byEntityType: [
      {
        entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
        amount: '140000',
        vatAmount: '0',
        pitAmount: '0',
        rows: 1,
      },
    ],
    byTenant: [
      {
        tenantId: '01TENANT',
        tenantName: 'Gian hàng A',
        entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
        taxCode: 'TX123',
        legalName: null,
        amount: '140000',
        vatAmount: '0',
        pitAmount: '0',
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
    taxSubjectType: null,
    taxCode: 'TX123',
    legalName: null,
    taxableBase: '1400000',
    percent: 10,
    // Dòng một-mức trước ADR 0068 — không tách GTGT/TNCN.
    vatPercent: null,
    pitPercent: null,
    vatAmount: null,
    pitAmount: null,
    taxCategory: null,
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

function renderPanel(params = '') {
  nav.params = new URLSearchParams(params);
  return render(
    <App>
      <TaxPeriodPanel />
    </App>,
  );
}

beforeEach(() => {
  asked.summary = [];
  asked.rows = [];
  nav.replace.mockReset();
  summary.data = makeSummary();
  summary.isError = false;
  rows.data = { data: [makeRow()], meta: { page: 1, limit: 20, total: 1, hasNext: false } };
  rows.isError = false;
});

describe('TaxPeriodPanel — kỳ đang xem nằm trên URL', () => {
  it('`?period=` mở đúng kỳ đó (thẻ "Thuế chưa kê khai" dẫn tới kỳ cũ nhất còn nợ)', () => {
    renderPanel('queue=tax&period=2001-01&page=2');
    expect(asked.summary.at(-1)).toBe('2001-01');
    expect(asked.rows.at(-1)).toEqual({ period: '2001-01', page: 2 });
  });

  it('kỳ TƯƠNG LAI hay giá trị rác ⇒ về kỳ hiện hành, không hỏi một kỳ chưa có', () => {
    renderPanel('queue=tax&period=2999-01');
    const current = asked.summary.at(-1)!;
    expect(current).not.toBe('2999-01');
    expect(current).toMatch(/^\d{4}-\d{2}$/);

    renderPanel('queue=tax&period=rac');
    expect(asked.summary.at(-1)).toBe(current);
  });
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
        { entityType: SELLER_ENTITY_TYPE.INDIVIDUAL, amount: '100000', vatAmount: '0', pitAmount: '0', rows: 1 },
        { entityType: 'unknown', amount: '40000', vatAmount: '0', pitAmount: '0', rows: 1 },
      ],
    });
    renderPanel();

    expect(screen.getAllByText('Chưa khai hồ sơ').length).toBeGreaterThan(0);
    const alert = document.querySelector('.ant-alert-warning') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(within(alert).getByText(/chưa khai hồ sơ người bán/i)).toBeTruthy();
  });

  it('dòng của gian hàng chưa khai hồ sơ: hiện "Chưa khai hồ sơ" + chủ thể ÁP THUẾ (cá nhân)', () => {
    rows.data = {
      data: [
        makeRow({
          entityType: 'unknown',
          taxSubjectType: SELLER_ENTITY_TYPE.INDIVIDUAL,
          taxCode: null,
        }),
      ],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPanel();
    expect(screen.getAllByText('Chưa khai hồ sơ').length).toBeGreaterThan(0);
    expect(screen.getByText('Khấu trừ như: Cá nhân')).toBeTruthy();
  });

  it('loại khai trùng chủ thể áp thuế ⇒ KHÔNG lặp dòng "Khấu trừ như"', () => {
    rows.data = {
      data: [makeRow({ taxSubjectType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPanel();
    expect(screen.queryByText(/^Khấu trừ như:/)).toBeNull();
  });

  it('kỳ TRỘN dòng cũ: hiện phần "chưa tách" để GTGT + TNCN + phần đó = tổng', () => {
    summary.data = makeSummary({
      totalAmount: '194600',
      totalVatAmount: '39000',
      totalPitAmount: '15600',
      totalUnsplitAmount: '140000',
    });
    renderPanel();
    expect(screen.getByText('Dòng cũ chưa tách GTGT/TNCN')).toBeTruthy();
  });

  it('kỳ chỉ có dòng tách ⇒ KHÔNG hiện ô "chưa tách"', () => {
    summary.data = makeSummary({
      totalAmount: '54600',
      totalVatAmount: '39000',
      totalPitAmount: '15600',
      totalUnsplitAmount: '0',
    });
    renderPanel();
    expect(screen.queryByText('Dòng cũ chưa tách GTGT/TNCN')).toBeNull();
  });

  it('nhóm `unknown` bằng 0 thì KHÔNG cảnh báo — không làm ồn khi không có việc', () => {
    summary.data = makeSummary({
      byEntityType: [{ entityType: 'unknown', amount: '0', vatAmount: '0', pitAmount: '0', rows: 0 }],
    });
    renderPanel();
    expect(document.querySelector('.ant-alert-warning')).toBeNull();
  });

  it('dòng tách GTGT/TNCN (ADR 0068): hai cột thuế, cặp tỷ lệ, nhóm; tổng kỳ có GTGT và TNCN', () => {
    summary.data = makeSummary({ totalVatAmount: '39000', totalPitAmount: '15600' });
    rows.data = {
      data: [
        makeRow({
          taxableBase: '780000',
          percent: 7,
          label: 'GTGT 5% + TNCN 2%',
          amount: '54600',
          vatPercent: 5,
          pitPercent: 2,
          vatAmount: '39000',
          pitAmount: '15600',
          taxCategory: 'service',
        }),
        makeRow({ id: '01OLD', bookingCode: 'DH000002' }),
      ],
      meta: { page: 1, limit: 20, total: 2, hasNext: false },
    };
    renderPanel();

    expect(screen.getByText('GTGT đã khấu trừ')).toBeTruthy();
    expect(screen.getByText('TNCN đã khấu trừ')).toBeTruthy();
    expect(screen.getByText('GTGT 5% + TNCN 2%')).toBeTruthy();
    expect(screen.getByText('Nhóm dịch vụ')).toBeTruthy();
    expect(screen.getAllByText(/^15[.,]600/).length).toBeGreaterThan(0);
    // Dòng một-mức cũ không bịa phép tách.
    expect(screen.getAllByText('Dòng cũ — không tách')).toHaveLength(2);
  });

  it('bút toán ĐẢO hiện số âm, và KHÔNG cho đảo lần nữa', () => {
    rows.data = {
      data: [
        makeRow({
          id: '01REV',
          amount: '-140000',
          reversalOfId: '01TAXROW',
          status: TAX_WITHHOLDING_STATUS.REVERSED,
          reversalReason: 'Sai tỷ lệ',
        }),
      ],
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
      data: [
        makeRow({
          status: TAX_WITHHOLDING_STATUS.REMITTED,
          remittedAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
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
