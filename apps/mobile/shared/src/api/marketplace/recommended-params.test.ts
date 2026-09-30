import { recommendedParams } from './api';

/**
 * Tham số của khối "Xe phù hợp với bạn" (ADR 0043).
 *
 * Hàm này phục vụ HAI việc — dựng query gửi lên, và dựng khoá cache. Đó là lý do nó tồn tại thay
 * vì hai object viết tay ở hai chỗ: lệch nhau một chiều thôi là hai ngữ cảnh khác nhau dùng chung
 * một ô cache, và khách đổi loại xe vẫn thấy đúng danh sách cũ.
 */
describe('recommendedParams', () => {
  it('đưa mọi chiều VẮNG MẶT về `null`, không bỏ khoá', () => {
    const params = recommendedParams({ nearProvinceCode: null, limit: 8 });

    /*
     * Bỏ khoá thay vì để `null` sẽ làm hai ngữ cảnh khác nhau ra CÙNG một khoá cache: "chưa chọn
     * dịch vụ" và "đã chọn rồi lại bỏ" phải là một, nhưng "chưa chọn loại xe" và "chưa chọn tỉnh"
     * thì không được trộn vào nhau.
     */
    expect(params).toEqual({
      vehicleType: null,
      serviceType: null,
      nearProvinceCode: null,
      pickupAt: null,
      returnAt: null,
      limit: 8,
    });
  });

  it('giữ nguyên chiều đã có', () => {
    const params = recommendedParams({
      vehicleType: 'car',
      serviceType: 'self_drive',
      nearProvinceCode: '01',
      pickupAt: '2026-10-01T03:00:00.000Z',
      returnAt: '2026-10-03T03:00:00.000Z',
      limit: 8,
    });

    expect(params.vehicleType).toBe('car');
    expect(params.serviceType).toBe('self_drive');
    expect(params.nearProvinceCode).toBe('01');
    expect(params.pickupAt).toBe('2026-10-01T03:00:00.000Z');
  });

  it('hai lần gọi cùng đầu vào cho KHOÁ CACHE bằng nhau', () => {
    const a = recommendedParams({ vehicleType: 'car', nearProvinceCode: '48', limit: 8 });
    const b = recommendedParams({ vehicleType: 'car', nearProvinceCode: '48', limit: 8 });

    expect(a).toEqual(b);
  });

  it('đổi tỉnh ƯU TIÊN thì khoá phải KHÁC — nếu không danh sách cũ ở lại', () => {
    const hanoi = recommendedParams({ nearProvinceCode: '01', limit: 8 });
    const danang = recommendedParams({ nearProvinceCode: '48', limit: 8 });

    expect(hanoi).not.toEqual(danang);
  });
});
