import type { DriverLicence } from '@/api/driver-licence/api';
import { resolveVerifierView } from './driver-licence-view';
import { driverLicencePollInterval, PENDING_REVIEW_POLL_MS, PROCESSING_POLL_MS } from './hooks/use-driver-licence';
import { buildLicenceTrip } from '../booking-requests/licence-trip';

/** Cùng các ca của `DriverLicenceVerifier.test.tsx` bên web — ADR 0057. */
const BASE: DriverLicence = {
  id: 'L1',
  status: 'verified',
  kind: 'vn',
  licenceNumber: '790123456789',
  fullName: 'NGUYỄN VĂN AN',
  dateOfBirth: '1990-04-12',
  classes: ['B2'],
  issuedOn: '2021-03-15',
  expiresOn: '2031-03-15',
  noExpiry: false,
  issuingCountry: 'VN',
  coversCar: true,
  coversMotorbike: false,
  rejectionReason: null,
  reviewNote: null,
  qualityIssues: [],
  canRequestReview: false,
  reviewRequestedAt: null,
  decisionSource: 'auto',
  decidedAt: '2026-10-01T00:00:00.000Z',
  submittedAt: '2026-10-01T00:00:00.000Z',
} as DriverLicence;

const view = (over: Partial<Parameters<typeof resolveVerifierView>[0]>) =>
  resolveVerifierView({
    overview: { verified: null, latest: null },
    replacing: false,
    pickedOver: undefined,
    today: '2026-10-09',
    ...over,
  });

describe('resolveVerifierView', () => {
  it('chưa nộp: khung nộp + giấy tờ được chấp nhận', () => {
    expect(view({})).toMatchObject({ kind: 'submit', showAccepted: true, rejected: null });
  });

  it('đã xác thực: usable', () => {
    expect(view({ overview: { verified: BASE, latest: BASE } }).kind).toBe('usable');
  });

  it('đang thay bằng: quay về khung nộp', () => {
    expect(view({ overview: { verified: BASE, latest: BASE }, replacing: true }).kind).toBe('submit');
  });

  it('đang đọc ảnh: khung nộp với processing', () => {
    const latest = { ...BASE, status: 'processing' } as DriverLicence;
    expect(view({ overview: { verified: null, latest } })).toMatchObject({
      kind: 'submit',
      processing: latest,
    });
  });

  it('chờ duyệt: pending', () => {
    const latest = { ...BASE, status: 'pending_review' } as DriverLicence;
    expect(view({ overview: { verified: null, latest } }).kind).toBe('pending');
  });

  it('bị từ chối: hiện lý do; chọn ảnh mới thì ẩn ngay', () => {
    const latest = { ...BASE, status: 'rejected', rejectionReason: 'unreadable' } as DriverLicence;
    expect(view({ overview: { verified: null, latest } })).toMatchObject({ rejected: latest });
    expect(view({ overview: { verified: null, latest }, pickedOver: 'L1' })).toMatchObject({
      rejected: null,
    });
  });

  it('hết hạn trước ngày trả xe: tripIssue expired', () => {
    expect(
      view({
        overview: { verified: BASE, latest: BASE },
        trip: { vehicleType: 'car', lastDayKey: '2031-03-20' },
      }),
    ).toMatchObject({ kind: 'submit', tripIssue: 'expired' });
  });

  it('bằng ô tô đặt xe máy: classMismatchMotorbike', () => {
    expect(
      view({
        overview: { verified: BASE, latest: BASE },
        trip: { vehicleType: 'motorbike', lastDayKey: '2027-01-01' },
      }),
    ).toMatchObject({ tripIssue: 'classMismatchMotorbike' });
  });
});

describe('driverLicencePollInterval', () => {
  it('hỏi dày khi đang đọc, thưa khi chờ duyệt, tắt khi đã có kết quả', () => {
    const at = (status: string) =>
      driverLicencePollInterval({ verified: null, latest: { ...BASE, status } as DriverLicence });
    expect(at('processing')).toBe(PROCESSING_POLL_MS);
    expect(at('pending_review')).toBe(PENDING_REVIEW_POLL_MS);
    expect(at('verified')).toBe(false);
  });
});

describe('buildLicenceTrip', () => {
  const base = {
    vehicleType: 'car',
    packageMonths: null,
    pickupPreference: null,
    requestedPickupDate: null,
    returnAt: null,
  };

  it('có tài xế: không cần bằng', () => {
    expect(
      buildLicenceTrip({ ...base, serviceType: 'with_driver', returnAt: '2026-10-12T03:00:00Z' }),
    ).toBeNull();
  });

  it('tự lái: ngày cuối theo giờ VN của thời điểm trả', () => {
    expect(
      buildLicenceTrip({ ...base, serviceType: 'self_drive', returnAt: '2026-10-12T03:00:00Z' }),
    ).toEqual({ vehicleType: 'car', lastDayKey: '2026-10-12' });
  });

  it('dài hạn ngày cụ thể: cộng tháng LỊCH', () => {
    expect(
      buildLicenceTrip({
        ...base,
        serviceType: 'long_term',
        packageMonths: 3,
        pickupPreference: 'specific_date',
        requestedPickupDate: '2026-11-30',
      }),
    ).toEqual({ vehicleType: 'car', lastDayKey: '2027-02-28' });
  });

  it('dài hạn chưa chọn gói: chưa soát được', () => {
    expect(buildLicenceTrip({ ...base, serviceType: 'long_term' })).toBeNull();
  });
});
