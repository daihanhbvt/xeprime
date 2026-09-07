import {
  TENANT_CUSTOMER_RELATIONSHIP,
  TENANT_CUSTOMER_SORT,
  isAllowedRelationship,
  isAllowedSort,
  relationshipValues,
  sortValues,
} from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../errors';
import {
  CUSTOMERS_DEFAULT_LIMIT,
  customerFiltersToParams,
  duplicateCustomerId,
} from './api';

/**
 * Bộ lọc sổ khách được serialize bằng ĐÚNG một hàm cho cả web lẫn app native.
 *
 * Hai client dựng hai bộ query params khác nhau cho cùng một endpoint là cách chắc chắn nhất để
 * một `invalidateQueries` chỉ làm mới đúng một nửa số màn, và để một bên im lặng gửi thiếu tham số.
 */
describe('customerFiltersToParams', () => {
  it('bộ lọc rỗng vẫn gửi trang 1 và limit mặc định — không để server tự đoán', () => {
    expect(customerFiltersToParams({})).toEqual({
      q: null,
      relationship: null,
      sort: null,
      page: 1,
      limit: CUSTOMERS_DEFAULT_LIMIT,
    });
  });

  it('trường không đặt thành `null`, KHÔNG thành chuỗi rỗng', () => {
    const params = customerFiltersToParams({ q: 'an' });
    expect(params.q).toBe('an');
    expect(params.relationship).toBeNull();
    expect(params.sort).toBeNull();
  });

  it('giữ nguyên trang và limit người gọi truyền vào', () => {
    expect(customerFiltersToParams({ page: 3, limit: 10 })).toMatchObject({ page: 3, limit: 10 });
  });

  it('mã nhóm và mã sắp xếp đi thẳng, không bị dịch', () => {
    const params = customerFiltersToParams({
      relationship: TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT,
      sort: TENANT_CUSTOMER_SORT.DEBT,
    });
    expect(params.relationship).toBe('has_debt');
    expect(params.sort).toBe('debt');
  });
});

/**
 * Lựa chọn TÀI CHÍNH bị backend từ chối bằng 403 khi thiếu `finance.view`, nên client không được
 * bày chúng ra. Luật này sống ở `@xeprime/types` để web và app native lọc theo cùng một danh sách.
 */
describe('gate tài chính của bộ lọc / sắp xếp', () => {
  it('thiếu `finance.view`: bỏ nhóm "Còn nợ" khỏi danh sách chọn', () => {
    expect(relationshipValues(false)).not.toContain(TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT);
    expect(relationshipValues(true)).toContain(TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT);
  });

  it('thiếu `finance.view`: bỏ cả hai kiểu sắp xếp theo tiền', () => {
    expect(sortValues(false)).not.toContain(TENANT_CUSTOMER_SORT.DEBT);
    expect(sortValues(false)).not.toContain(TENANT_CUSTOMER_SORT.TOTAL_VALUE);
    expect(sortValues(false)).toContain(TENANT_CUSTOMER_SORT.LAST_RENTAL);
  });

  it('giá trị tài chính đến từ nguồn không kiểm soát được bị từ chối khi thiếu quyền', () => {
    expect(isAllowedRelationship('has_debt', false)).toBe(false);
    expect(isAllowedRelationship('has_debt', true)).toBe(true);
    expect(isAllowedSort('debt', false)).toBe(false);
    expect(isAllowedSort('total_value', false)).toBe(false);
    expect(isAllowedSort('debt', true)).toBe(true);
  });

  it('giá trị lạ bị từ chối kể cả khi có quyền — không gửi rác xuống backend', () => {
    expect(isAllowedRelationship('vip', true)).toBe(false);
    expect(isAllowedSort('fortnight', true)).toBe(false);
    expect(isAllowedRelationship(undefined, true)).toBe(false);
  });
});

/**
 * 409 trùng SĐT mang theo id hồ sơ đang giữ số đó. Đọc `details` sai một chỗ là mất lối
 * "Mở hồ sơ đang có" ở một client mà không ai nhận ra.
 */
describe('duplicateCustomerId', () => {
  it('đọc `customerId` từ `details` của lỗi', () => {
    const error = new ApiClientError({
      code: 'CUSTOMER_PHONE_DUPLICATE',
      message: 'x',
      status: 409,
      details: { customerId: '01JQZX0000000000000000000C' },
    });
    expect(duplicateCustomerId(error)).toBe('01JQZX0000000000000000000C');
  });

  it('409 KHÔNG kèm id: trả `null` — nơi gọi vẫn giải thích, chỉ không có lối mở nhanh', () => {
    const error = new ApiClientError({ code: 'CUSTOMER_PHONE_DUPLICATE', message: 'x', status: 409 });
    expect(duplicateCustomerId(error)).toBeNull();
  });

  it('lỗi không phải của API: trả `null` thay vì nổ', () => {
    expect(duplicateCustomerId(new Error('boom'))).toBeNull();
    expect(duplicateCustomerId(undefined)).toBeNull();
  });
});
