import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import {
  RECEIPTS_DEFAULT_LIMIT,
  customerRevenueParams,
  debtFiltersToParams,
  financeByCategoryParams,
  financeRangeParams,
  financeSeriesParams,
  hasReceiptFilters,
  receiptFiltersToParams,
  receiptSummaryParams,
  vehicleProfitParams,
} from './api';

/**
 * Bộ lọc sổ Thu-Chi được serialize bằng ĐÚNG một hàm cho cả web lẫn app native.
 *
 * Hai client dựng hai bộ query params khác nhau cho cùng một endpoint là cách chắc chắn nhất để
 * một `invalidateQueries` chỉ làm mới đúng một nửa số màn, và để một bên im lặng gửi thiếu tham số.
 */
describe('receiptFiltersToParams', () => {
  it('bộ lọc rỗng vẫn gửi trang 1 và limit mặc định — không để server tự đoán', () => {
    expect(receiptFiltersToParams({})).toEqual({
      type: null,
      status: null,
      categoryId: null,
      source: null,
      sourceGroup: null,
      paymentMethod: null,
      bookingId: null,
      vehicleId: null,
      tenantCustomerId: null,
      q: null,
      from: null,
      to: null,
      page: 1,
      limit: RECEIPTS_DEFAULT_LIMIT,
    });
  });

  it('mã đi thẳng, không bị dịch — status/type/sourceGroup là DỮ LIỆU', () => {
    const params = receiptFiltersToParams({
      type: RECEIPT_TYPE.INCOME,
      status: RECEIPT_STATUS.APPROVED,
      sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
    });
    expect(params.type).toBe('income');
    expect(params.status).toBe('approved');
    expect(params.sourceGroup).toBe('held_funds');
  });

  it('phạm vi thực thể (đơn · xe · khách) đi xuống API nguyên vẹn', () => {
    const params = receiptFiltersToParams({
      bookingId: 'b1',
      vehicleId: 'v1',
      tenantCustomerId: 'c1',
    });
    expect(params).toMatchObject({ bookingId: 'b1', vehicleId: 'v1', tenantCustomerId: 'c1' });
  });
});

/**
 * Thẻ tổng KHÔNG được mang phân trang.
 *
 * Giữ `page`/`limit` lại là mỗi lần sang trang sinh một query key mới cho một con số không đổi —
 * bốn thẻ nhấp nháy về skeleton ở mọi cú bấm trang.
 */
describe('receiptSummaryParams', () => {
  it('bỏ page và limit, giữ nguyên phần còn lại của bộ lọc', () => {
    const params = receiptSummaryParams({
      type: RECEIPT_TYPE.EXPENSE,
      from: '2026-09-01',
      to: '2026-09-30',
      page: 4,
      limit: 50,
    });
    expect(params).not.toHaveProperty('page');
    expect(params).not.toHaveProperty('limit');
    expect(params).toMatchObject({ type: 'expense', from: '2026-09-01', to: '2026-09-30' });
  });

  it('hai trang khác nhau của cùng bộ lọc cho ra CÙNG tham số tổng', () => {
    const base = { tenantCustomerId: 'c1', status: RECEIPT_STATUS.APPROVED };
    expect(receiptSummaryParams({ ...base, page: 1 })).toEqual(
      receiptSummaryParams({ ...base, page: 7 }),
    );
  });
});

/**
 * "Đang lọc" quyết định câu chữ của trạng thái rỗng: gỡ bộ lọc hay tạo phiếu đầu tiên là hai lối
 * ra khác hẳn nhau. Đếm ĐỦ mọi chiều, kể cả chiều chỉ đến từ đường dẫn.
 */
describe('hasReceiptFilters', () => {
  it('không có gì ⇒ false', () => {
    expect(hasReceiptFilters({})).toBe(false);
  });

  it('phân trang KHÔNG phải bộ lọc', () => {
    expect(hasReceiptFilters({ page: 3, limit: 50 })).toBe(false);
  });

  it.each([
    ['type', { type: RECEIPT_TYPE.INCOME }],
    ['status', { status: RECEIPT_STATUS.APPROVED }],
    ['khoảng ngày', { from: '2026-09-01' }],
    ['danh mục', { categoryId: 'cat1' }],
    ['phạm vi khách', { tenantCustomerId: 'c1' }],
    ['nhóm nguồn', { sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS }],
  ])('%s tính là đang lọc', (_label, filters) => {
    expect(hasReceiptFilters(filters)).toBe(true);
  });
});

/**
 * Phạm vi đi CÙNG bộ tham số kỳ. Tách riêng là mở đường cho khoá cache và request dựng từ hai
 * object khác nhau — lúc đó hồ sơ xe A đọc trúng cache của xe B.
 */
describe('financeRangeParams · financeSeriesParams · financeByCategoryParams', () => {
  it('không có scope ⇒ hai khoá phạm vi vẫn có mặt, giá trị null', () => {
    expect(financeRangeParams({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      vehicleId: null,
      tenantCustomerId: null,
    });
  });

  it('scope xe và scope khách cho ra hai bộ tham số KHÁC nhau', () => {
    const period = { from: '2026-09-01', to: '2026-09-30' };
    expect(financeRangeParams(period, { vehicleId: 'v1' })).not.toEqual(
      financeRangeParams(period, { tenantCustomerId: 'v1' }),
    );
  });

  it('độ mịn chỉ có ở chuỗi thời gian — thẻ tổng không hiểu nó', () => {
    const period = { from: '2026-09-01', to: '2026-09-30', granularity: 'week' };
    expect(financeSeriesParams(period).granularity).toBe('week');
    expect(financeRangeParams(period)).not.toHaveProperty('granularity');
  });

  it('cơ cấu theo danh mục mang thêm CHIỀU tiền', () => {
    expect(financeByCategoryParams({ from: '2026-09-01' }, RECEIPT_TYPE.EXPENSE)).toMatchObject({
      from: '2026-09-01',
      type: 'expense',
    });
  });
});

/**
 * Hai bảng xếp hạng trên cùng một màn phải phân trang ĐỘC LẬP ở tầng giao diện, nhưng xuống API
 * thì cả hai đều là `sort`/`page` — tiền tố là chuyện của màn, không phải của endpoint.
 */
describe('vehicleProfitParams · customerRevenueParams', () => {
  it('bảng theo xe đọc `sort`/`page`, bảng theo khách đọc `customerSort`/`customerPage`', () => {
    const filters = {
      from: '2026-09-01',
      to: '2026-09-30',
      sort: 'revenue',
      page: 3,
      customerSort: 'trips',
      customerPage: 2,
    };
    expect(vehicleProfitParams(filters)).toMatchObject({ sort: 'revenue', page: 3 });
    expect(customerRevenueParams(filters)).toMatchObject({ sort: 'trips', page: 2 });
  });

  it('đổi trang bảng khách KHÔNG đụng tham số bảng xe', () => {
    const base = { from: '2026-09-01', to: '2026-09-30', page: 1 };
    expect(vehicleProfitParams({ ...base, customerPage: 5 })).toEqual(
      vehicleProfitParams({ ...base }),
    );
  });

  it('bảng theo khách KHÔNG gửi phạm vi thực thể — nó vốn là bảng của cả kỳ', () => {
    expect(customerRevenueParams({ from: '2026-09-01' })).not.toHaveProperty('tenantCustomerId');
  });
});

describe('debtFiltersToParams', () => {
  it('bộ lọc rỗng vẫn gửi trang 1 và limit mặc định', () => {
    expect(debtFiltersToParams({})).toEqual({
      q: null,
      filter: null,
      page: 1,
      limit: RECEIPTS_DEFAULT_LIMIT,
    });
  });

  it('từ khoá và nhóm hạn đi thẳng xuống server, không cắt ở client', () => {
    expect(debtFiltersToParams({ q: '51A', filter: 'overdue', page: 2 })).toMatchObject({
      q: '51A',
      filter: 'overdue',
      page: 2,
    });
  });
});
