import { branchFiltersToParams } from '../branches/api';
import { driverFiltersToParams } from '../drivers/api';
import { MEMBERS_DEFAULT_LIMIT, rosterFiltersToParams } from './api';

/**
 * Bộ lọc của ba màn Gian hàng KHÔNG có trong contract OpenAPI — chúng là trạng thái của MÀN
 * HÌNH. Nhưng cả hai client phải serialize chúng qua ĐÚNG một hàm: query key của TanStack Query
 * dựng từ chính bộ tham số này, nên lệch một trường là hai bản ghi cache cho cùng một câu hỏi,
 * và một lần `invalidateQueries` sau khi ghi chỉ làm mới đúng một nửa số màn.
 *
 * Đó là lý do những test này soi ĐÚNG hình dạng object, không chỉ soi vài khoá.
 */

describe('rosterFiltersToParams', () => {
  it('bộ lọc rỗng: mọi chiều là `null`, trang 1, giới hạn mặc định', () => {
    expect(rosterFiltersToParams({})).toEqual({
      q: null,
      roleKey: null,
      status: null,
      page: 1,
      limit: MEMBERS_DEFAULT_LIMIT,
    });
  });

  it('giữ nguyên giá trị đã đặt, kể cả `limit` do màn hình ghi đè', () => {
    expect(
      rosterFiltersToParams({ q: 'an', roleKey: 'shop_staff', status: 'locked', page: 3, limit: 10 }),
    ).toEqual({ q: 'an', roleKey: 'shop_staff', status: 'locked', page: 3, limit: 10 });
  });
});

describe('branchFiltersToParams', () => {
  it('gọi không tham số cũng ra đúng hình dạng - bộ chọn ở thanh trên dựa vào điều này', () => {
    expect(branchFiltersToParams()).toEqual({ q: null, status: null });
  });

  it('lọc theo trạng thái đang hoạt động', () => {
    expect(branchFiltersToParams({ status: 'active' })).toEqual({ q: null, status: 'active' });
  });
});

describe('driverFiltersToParams', () => {
  it('ba chiều lọc + phân trang, chiều nào trống thì `null`', () => {
    expect(driverFiltersToParams({ q: 'Trần' })).toEqual({
      q: 'Trần',
      linkStatus: null,
      driverType: null,
      operation: null,
      licenceCheck: null,
      month: null,
      sort: 'newest',
      page: 1,
      limit: 20,
    });
  });
});
