import { PICKUP_PREFERENCE, SERVICE_TYPE, longTermPickupWindow } from '@xeprime/types';
import { licenceTripLastDayKey } from '@xeprime/domain';
import { buildLicenceTrip } from './licence-trip';

const base = {
  vehicleType: 'car',
  packageMonths: null,
  pickupPreference: null,
  requestedPickupDate: null,
  returnAt: null,
};

describe('buildLicenceTrip', () => {
  it('thuê có tài xế ⇒ null (không soát bằng của khách)', () => {
    expect(
      buildLicenceTrip({
        ...base,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        returnAt: '2026-10-12T02:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('tự lái: ngày cuối = ngày (giờ VN) của thời điểm trả, trả đúng nửa đêm thì lùi một ngày', () => {
    expect(
      buildLicenceTrip({
        ...base,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        returnAt: '2026-10-12T02:00:00.000Z',
      }),
    ).toEqual({ vehicleType: 'car', lastDayKey: '2026-10-12' });
    // 00:00 ngày 13 giờ VN = 17:00Z ngày 12 ⇒ ngày cuối là 12.
    expect(
      buildLicenceTrip({
        ...base,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        returnAt: '2026-10-12T17:00:00.000Z',
      })?.lastDayKey,
    ).toBe('2026-10-12');
  });

  it('tự lái chưa có / sai giờ trả ⇒ null', () => {
    expect(buildLicenceTrip({ ...base, serviceType: SERVICE_TYPE.SELF_DRIVE })).toBeNull();
    expect(
      buildLicenceTrip({ ...base, serviceType: SERVICE_TYPE.SELF_DRIVE, returnAt: 'không-phải-ngày' }),
    ).toBeNull();
  });

  it('dài hạn chưa chọn gói ⇒ null', () => {
    expect(buildLicenceTrip({ ...base, serviceType: SERVICE_TYPE.LONG_TERM })).toBeNull();
  });

  it('dài hạn ngày cụ thể ⇒ ngày đó + N tháng LỊCH', () => {
    expect(
      buildLicenceTrip({
        ...base,
        serviceType: SERVICE_TYPE.LONG_TERM,
        packageMonths: 3,
        pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
        requestedPickupDate: '2026-11-30',
      }),
    ).toEqual({ vehicleType: 'car', lastDayKey: '2027-02-28' });
  });

  it('dài hạn theo cửa sổ nguyện vọng ⇒ cuối cửa sổ + N tháng', () => {
    const now = new Date('2026-10-09T03:00:00.000Z');
    const end = longTermPickupWindow(now).end;
    expect(
      buildLicenceTrip({
        ...base,
        vehicleType: null,
        serviceType: SERVICE_TYPE.LONG_TERM,
        packageMonths: 1,
        pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
        now,
      }),
    ).toEqual({
      vehicleType: null,
      lastDayKey: licenceTripLastDayKey({ latestPickupDateKey: end, packageMonths: 1 }),
    });
  });
});
