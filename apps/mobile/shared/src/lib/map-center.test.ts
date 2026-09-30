import { LOCATION_PERMISSION } from '@/lib/device-location';
import { FALLBACK_CENTER } from '@/lib/map-interactive';
import { mapCenterNow, resolveMapCenter } from '@/lib/map-center';

jest.mock('@/lib/device-location', () => ({
  LOCATION_PERMISSION: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
    UNAVAILABLE: 'unavailable',
  },
  getCachedDeviceCoords: jest.fn(() => null),
  getLocationPermission: jest.fn(async () => 'undetermined'),
  requestLocationPermission: jest.fn(async () => 'denied'),
  readDeviceCoords: jest.fn(async () => null),
}));

const deviceLocation = jest.requireMock('@/lib/device-location') as {
  getCachedDeviceCoords: jest.Mock;
  getLocationPermission: jest.Mock;
  requestLocationPermission: jest.Mock;
  readDeviceCoords: jest.Mock;
};

const PIN = { lat: 21.03, lng: 105.85 };
const PROVINCE = { lat: 16.05, lng: 108.21 };
const DEVICE = { latitude: 13.78, longitude: 109.22, accuracy: 30, source: 'cached' } as const;

beforeEach(() => {
  jest.clearAllMocks();
  deviceLocation.getCachedDeviceCoords.mockReturnValue(null);
  deviceLocation.getLocationPermission.mockResolvedValue(LOCATION_PERMISSION.UNDETERMINED);
  deviceLocation.requestLocationPermission.mockResolvedValue(LOCATION_PERMISSION.DENIED);
  deviceLocation.readDeviceCoords.mockResolvedValue(null);
});

describe('mapCenterNow', () => {
  it('ghim đang có thắng tất cả', () => {
    deviceLocation.getCachedDeviceCoords.mockReturnValue(DEVICE);
    expect(mapCenterNow({ value: PIN, anchor: PROVINCE })).toEqual({
      center: PIN,
      source: 'value',
    });
  });

  it('điểm neo của bề mặt đứng TRƯỚC vị trí thiết bị', () => {
    deviceLocation.getCachedDeviceCoords.mockReturnValue(DEVICE);
    expect(mapCenterNow({ anchor: PROVINCE })).toEqual({ center: PROVINCE, source: 'anchor' });
  });

  it('không có neo thì dùng vị trí đã đọc được trong lượt chạy này', () => {
    deviceLocation.getCachedDeviceCoords.mockReturnValue(DEVICE);
    expect(mapCenterNow({})).toEqual({
      center: { lat: DEVICE.latitude, lng: DEVICE.longitude },
      source: 'device',
    });
  });

  it('không biết gì thì báo rõ là hằng số', () => {
    expect(mapCenterNow({})).toEqual({ center: FALLBACK_CENTER, source: 'fallback' });
  });
});

describe('resolveMapCenter', () => {
  it('có neo thì KHÔNG đo và KHÔNG hỏi quyền', async () => {
    const resolved = await resolveMapCenter({ anchor: PROVINCE });

    expect(resolved.source).toBe('anchor');
    expect(deviceLocation.getLocationPermission).not.toHaveBeenCalled();
    expect(deviceLocation.readDeviceCoords).not.toHaveBeenCalled();
  });

  it('không có gì ⇒ xin quyền rồi đo', async () => {
    deviceLocation.requestLocationPermission.mockResolvedValue(LOCATION_PERMISSION.GRANTED);
    deviceLocation.readDeviceCoords.mockResolvedValue(DEVICE);

    const resolved = await resolveMapCenter({});

    expect(resolved).toEqual({
      center: { lat: DEVICE.latitude, lng: DEVICE.longitude },
      source: 'device',
    });
  });

  it('mayAsk=false thì không hiện hộp thoại nào', async () => {
    const resolved = await resolveMapCenter({ mayAsk: false });

    expect(deviceLocation.requestLocationPermission).not.toHaveBeenCalled();
    expect(resolved.source).toBe('fallback');
  });

  it('đã từ chối trước đó thì không hỏi lại, và rơi về hằng số', async () => {
    deviceLocation.getLocationPermission.mockResolvedValue(LOCATION_PERMISSION.DENIED);

    const resolved = await resolveMapCenter({});

    expect(deviceLocation.requestLocationPermission).not.toHaveBeenCalled();
    expect(resolved).toEqual({ center: FALLBACK_CENTER, source: 'fallback' });
  });

  it('đo hỏng ⇒ vẫn mở bản đồ ở hằng số, không treo', async () => {
    deviceLocation.getLocationPermission.mockResolvedValue(LOCATION_PERMISSION.GRANTED);
    deviceLocation.readDeviceCoords.mockResolvedValue(null);

    expect(await resolveMapCenter({})).toEqual({ center: FALLBACK_CENTER, source: 'fallback' });
  });
});
