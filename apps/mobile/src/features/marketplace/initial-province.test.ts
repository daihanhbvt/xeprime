import { LOCATION_PERMISSION } from '@/lib/device-location';
import {
  PROVINCE_SOURCE,
  resolveInitialProvince,
  type InitialProvinceDeps,
} from './initial-province';

/** Hai tỉnh ĐANG CÓ XE; mọi mã khác là "có thật nhưng chợ chưa có xe ở đó". */
const WITH_VEHICLES = ['01', '48'];

function deps(overrides: Partial<InitialProvinceDeps> = {}): InitialProvinceDeps {
  return {
    hasVehicles: (code) => WITH_VEHICLES.includes(code),
    readRemembered: async () => null,
    readGeoCache: async () => null,
    readDeliveryProvince: async () => null,
    mayAskPermission: true,
    getPermission: async () => LOCATION_PERMISSION.UNDETERMINED,
    requestPermission: async () => LOCATION_PERMISSION.DENIED,
    readCoords: async () => null,
    reverseProvince: async () => null,
    rememberGeo: jest.fn(),
    ...overrides,
  };
}

const COORDS = { latitude: 13.78, longitude: 109.22, accuracy: 30, source: 'cached' } as const;

describe('resolveInitialProvince', () => {
  it('lựa chọn của người dùng thắng cả vị trí thiết bị', async () => {
    const readCoords = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({ readRemembered: async () => '48', readCoords }),
    );

    expect(resolved).toEqual({ code: '48', source: PROVINCE_SOURCE.REMEMBERED });
    // Không chạm tới thiết bị: đã có câu trả lời thì không có gì để đo.
    expect(readCoords).not.toHaveBeenCalled();
  });

  it('bỏ qua lựa chọn cũ khi tỉnh đó không còn xe, và KHÔNG xoá nó', async () => {
    const resolved = await resolveInitialProvince(
      deps({ readRemembered: async () => '77', readGeoCache: async () => '01' }),
    );

    expect(resolved).toEqual({ code: '01', source: PROVINCE_SOURCE.GEO_CACHE });
  });

  it('bộ đệm "Toàn quốc" dừng chuỗi — không bật GPS lại trong hạn', async () => {
    const readCoords = jest.fn();
    const requestPermission = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({ readGeoCache: async () => '', readCoords, requestPermission }),
    );

    expect(resolved.source).toBe(PROVINCE_SOURCE.NATIONWIDE);
    expect(readCoords).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('dùng tỉnh của địa chỉ giao xe đã xác nhận trước khi hỏi quyền', async () => {
    const requestPermission = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({ readDeliveryProvince: async () => '01', requestPermission }),
    );

    expect(resolved).toEqual({ code: '01', source: PROVINCE_SOURCE.DELIVERY_ADDRESS });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('đo vị trí, tra ngược ra tỉnh và NHỚ lại phép đo', async () => {
    const rememberGeo = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({
        getPermission: async () => LOCATION_PERMISSION.GRANTED,
        readCoords: async () => COORDS,
        reverseProvince: async () => '48',
        rememberGeo,
      }),
    );

    expect(resolved).toEqual({ code: '48', source: PROVINCE_SOURCE.DEVICE });
    expect(rememberGeo).toHaveBeenCalledWith('48');
  });

  it('tỉnh đo được chưa có xe ⇒ Toàn quốc, và nhớ là đã đo', async () => {
    const rememberGeo = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({
        getPermission: async () => LOCATION_PERMISSION.GRANTED,
        readCoords: async () => COORDS,
        // Bình Định đã sáp nhập vào Gia Lai; giả sử chợ chưa có xe nào ở đó.
        reverseProvince: async () => '52',
        rememberGeo,
      }),
    );

    expect(resolved.source).toBe(PROVINCE_SOURCE.NATIONWIDE);
    expect(rememberGeo).toHaveBeenCalledWith('');
  });

  it('không hỏi quyền khi bề mặt không cho phép', async () => {
    const requestPermission = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({ mayAskPermission: false, requestPermission }),
    );

    expect(resolved.source).toBe(PROVINCE_SOURCE.NATIONWIDE);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('quyền đã bị từ chối trước đó thì KHÔNG hỏi lại', async () => {
    const requestPermission = jest.fn();
    const resolved = await resolveInitialProvince(
      deps({ getPermission: async () => LOCATION_PERMISSION.DENIED, requestPermission }),
    );

    expect(resolved.source).toBe(PROVINCE_SOURCE.NATIONWIDE);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('bản đồ tắt (tra ngược trả null) ⇒ Toàn quốc, không nổ', async () => {
    const resolved = await resolveInitialProvince(
      deps({
        getPermission: async () => LOCATION_PERMISSION.GRANTED,
        readCoords: async () => COORDS,
        reverseProvince: async () => null,
      }),
    );

    expect(resolved.source).toBe(PROVINCE_SOURCE.NATIONWIDE);
  });
});
