import { branchFiltersToParams } from '../branches/api';
import { driverFiltersToParams } from '../drivers/api';
import { inviteFiltersToParams, memberFiltersToParams, MEMBERS_DEFAULT_LIMIT } from './api';

/**
 * Bộ lọc của ba màn Gian hàng KHÔNG có trong contract OpenAPI — chúng là trạng thái của MÀN
 * HÌNH. Nhưng cả hai client phải serialize chúng qua ĐÚNG một hàm: query key của TanStack Query
 * dựng từ chính bộ tham số này, nên lệch một trường là hai bản ghi cache cho cùng một câu hỏi,
 * và một lần `invalidateQueries` sau khi ghi chỉ làm mới đúng một nửa số màn.
 *
 * Đó là lý do những test này soi ĐÚNG hình dạng object, không chỉ soi vài khoá.
 */

describe('memberFiltersToParams', () => {
  it('bộ lọc rỗng: mọi chiều là `null`, trang 1, giới hạn mặc định', () => {
    expect(memberFiltersToParams({})).toEqual({
      q: null,
      roleKey: null,
      page: 1,
      limit: MEMBERS_DEFAULT_LIMIT,
    });
  });

  it('giữ nguyên giá trị đã đặt, kể cả `limit` do màn hình ghi đè', () => {
    expect(memberFiltersToParams({ q: 'an', roleKey: 'shop_staff', page: 3, limit: 10 })).toEqual({
      q: 'an',
      roleKey: 'shop_staff',
      page: 3,
      limit: 10,
    });
  });
});

describe('inviteFiltersToParams', () => {
  it('không tự đặt `status`: mặc định của server là "đang chờ", client không đoán thay', () => {
    expect(inviteFiltersToParams({})).toEqual({
      status: null,
      page: 1,
      limit: MEMBERS_DEFAULT_LIMIT,
    });
  });
});

describe('branchFiltersToParams', () => {
  it('gọi không tham số cũng ra đúng hình dạng — bộ chọn ở thanh trên dựa vào điều này', () => {
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
      status: null,
      driverType: null,
      page: 1,
      limit: 20,
    });
  });
});
