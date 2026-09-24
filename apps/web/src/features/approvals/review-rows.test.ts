import { describe, expect, it } from 'vitest';
import {
  hasApprovalBlockers,
  pickupAddress,
  pricingPolicyRows,
  splitDeliveryTiers,
  vehicleInfoRows,
  type ReviewRow,
} from './review-rows';
import { carReview, electricCarReview, motorbikeReview } from './test-utils';

const labels = (rows: readonly ReviewRow[]) => rows.map((row) => row.label);
const valueOf = (rows: readonly ReviewRow[], label: string) =>
  rows.find((row) => row.label === label)?.value;

/**
 * Dòng nào hiện trên hồ sơ duyệt — luật đọc từ `vehicleFieldPolicy`, cùng ma trận với form đăng
 * xe và cổng gửi duyệt. Hồ sơ duyệt không được hiện một trường mà form chưa bao giờ hỏi.
 */
describe('vehicleInfoRows — trường theo loại xe và nguồn năng lượng', () => {
  it('ô tô xăng: số chỗ + kiểu dáng + mức tiêu thụ; KHÔNG phân khúc, dung tích, thông số điện', () => {
    const rows = vehicleInfoRows(carReview().vehicle);

    expect(labels(rows)).toEqual(
      expect.arrayContaining(['seatCount', 'bodyType', 'fuelConsumption', 'transmission']),
    );
    expect(labels(rows)).not.toContain('motorbikeCategory');
    expect(labels(rows)).not.toContain('electricRange');
    expect(labels(rows)).not.toContain('batteryCapacity');
    expect(valueOf(rows, 'seatCount')).toEqual({ kind: 'measure', value: 5, unit: 'seats' });
  });

  it('xe máy: phân khúc + dung tích; KHÔNG số chỗ, KHÔNG kiểu dáng thân xe', () => {
    const rows = vehicleInfoRows(motorbikeReview().vehicle);

    expect(labels(rows)).toEqual(
      expect.arrayContaining(['motorbikeCategory', 'engineDisplacement']),
    );
    expect(labels(rows)).not.toContain('seatCount');
    expect(labels(rows)).not.toContain('bodyType');
    // Lít/100km tuỳ chọn với xe máy và đang trống — không có dòng "—".
    expect(labels(rows)).not.toContain('fuelConsumption');
  });

  it('dữ liệu cũ mang số chỗ trên XE MÁY vẫn không hiện: không áp dụng thì không có dòng', () => {
    const vehicle = { ...motorbikeReview().vehicle, seatCount: 2 };
    expect(labels(vehicleInfoRows(vehicle))).not.toContain('seatCount');
  });

  it('ô tô điện: quãng đường + pin; KHÔNG lít/100km', () => {
    const rows = vehicleInfoRows(electricCarReview().vehicle);

    expect(labels(rows)).toEqual(expect.arrayContaining(['electricRange', 'batteryCapacity']));
    expect(labels(rows)).not.toContain('fuelConsumption');
    expect(labels(rows)).not.toContain('engineDisplacement');
  });

  it('trường trống không sinh dòng (không có dòng rỗng để quét qua)', () => {
    const vehicle = { ...carReview().vehicle, color: null, plateNumber: '  ' };
    const rows = vehicleInfoRows(vehicle);
    expect(labels(rows)).not.toContain('color');
    expect(labels(rows)).not.toContain('plateNumber');
  });
});

describe('pricingPolicyRows — chỉ giá của dịch vụ xe đăng, chỉ chính sách áp dụng', () => {
  it('tự lái: giá ngày + giảm giá + tự nhận + giao xe + giới hạn km + điều khoản', () => {
    const rows = pricingPolicyRows(carReview());

    expect(labels(rows)).toEqual([
      'weekdayPrice',
      'discountPercent',
      'autoAccept',
      'delivery',
      'deliveryRadius',
      'deliveryFree',
      'deliveryFees',
      'mileageLimit',
      'excessFee',
      'collateral',
      'terms',
    ]);
    expect(valueOf(rows, 'autoAccept')).toEqual({ kind: 'toggle', on: false });
    expect(valueOf(rows, 'deliveryFree')).toEqual({ kind: 'measure', value: 5, unit: 'withinKm' });
    expect(valueOf(rows, 'deliveryFees')).toEqual({
      kind: 'deliveryTiers',
      tiers: [{ fromKm: 5, toKm: 30, fee: '150000', free: false }],
    });
    expect(valueOf(rows, 'mileageLimit')).toEqual({
      kind: 'measure',
      value: 300,
      unit: 'kmPerDay',
    });
  });

  it('không giao xe: chỉ dòng "Giao xe tận nơi: Tắt", không bán kính/phí', () => {
    const detail = carReview();
    const rows = pricingPolicyRows({
      ...detail,
      policy: { ...detail.policy!, deliveryEnabled: false, deliveryTiers: [] },
    });
    expect(valueOf(rows, 'delivery')).toEqual({ kind: 'toggle', on: false });
    expect(labels(rows)).not.toContain('deliveryRadius');
    expect(labels(rows)).not.toContain('deliveryFees');
  });

  it('không giới hạn km: dòng "Không giới hạn", không có phí vượt', () => {
    const detail = carReview();
    const rows = pricingPolicyRows({
      ...detail,
      policy: { ...detail.policy!, includedDistanceKmPerDay: null, excessDistanceFeePerKm: null },
    });
    expect(valueOf(rows, 'mileageLimit')).toEqual({ kind: 'unlimited' });
    expect(labels(rows)).not.toContain('excessFee');
  });

  it('xe CHỈ có tài xế: không giá ngày tự lái, không giảm giá tự lái, không giới hạn km', () => {
    const detail = carReview();
    const rows = pricingPolicyRows({
      ...detail,
      vehicle: { ...detail.vehicle, serviceTypes: ['with_driver'] },
      pricing: { ...detail.pricing, withDriverDailyPrice: '1300000' },
      services: [{ serviceType: 'with_driver', autoAcceptEnabled: true, termsText: null }],
    });
    expect(labels(rows)).toContain('withDriverDailyPrice');
    expect(labels(rows)).not.toContain('weekdayPrice');
    expect(labels(rows)).not.toContain('discountPercent');
    expect(labels(rows)).not.toContain('mileageLimit');
  });

  it('nhiều dịch vụ: tự nhận chuyến/điều khoản lặp THEO dịch vụ và gắn tên dịch vụ', () => {
    const detail = carReview();
    const rows = pricingPolicyRows({
      ...detail,
      vehicle: { ...detail.vehicle, serviceTypes: ['self_drive', 'with_driver'] },
      pricing: { ...detail.pricing, withDriverDailyPrice: '1300000' },
      services: [
        { serviceType: 'self_drive', autoAcceptEnabled: true, termsText: null },
        { serviceType: 'with_driver', autoAcceptEnabled: false, termsText: 'Không hút thuốc' },
      ],
    });
    const auto = rows.filter((row) => row.label === 'autoAccept');
    expect(auto.map((row) => row.service)).toEqual(['self_drive', 'with_driver']);
    expect(rows.find((row) => row.label === 'terms')).toMatchObject({
      service: 'with_driver',
      wide: true,
    });
  });

  it('chưa có chính sách thuê: không dòng chính sách nào được bịa ra', () => {
    const rows = pricingPolicyRows(motorbikeReview());
    for (const label of ['delivery', 'mileageLimit', 'collateral', 'deposit']) {
      expect(labels(rows)).not.toContain(label);
    }
  });

  it('cọc tiền: có dòng tiền cọc; miễn thế chấp: không', () => {
    const detail = carReview();
    const cash = pricingPolicyRows({
      ...detail,
      policy: { ...detail.policy!, collateralMode: 'cash', depositAmount: '5000000' },
    });
    expect(valueOf(cash, 'deposit')).toEqual({ kind: 'money', amount: '5000000' });
    expect(labels(pricingPolicyRows(detail))).not.toContain('deposit');
  });
});

describe('splitDeliveryTiers', () => {
  it('bậc đầu phí 0 là vùng miễn phí; phần còn lại có mốc "từ" suy từ mốc trước', () => {
    expect(
      splitDeliveryTiers([
        { toKm: 3, fee: '0' },
        { toKm: 10, fee: '50000' },
        { toKm: 20, fee: '100000' },
      ]),
    ).toEqual({
      freeWithinKm: 3,
      paid: [
        { fromKm: 3, toKm: 10, fee: '50000', free: false },
        { fromKm: 10, toKm: 20, fee: '100000', free: false },
      ],
    });
  });

  it('bậc miễn phí nằm GIỮA vẫn được đánh dấu miễn phí — không in thành 0 ₫', () => {
    expect(
      splitDeliveryTiers([
        { toKm: 5, fee: '30000' },
        { toKm: 10, fee: '0' },
      ]).paid,
    ).toEqual([
      { fromKm: 0, toKm: 5, fee: '30000', free: false },
      { fromKm: 5, toKm: 10, fee: '0', free: true },
    ]);
  });

  it('không có vùng miễn phí', () => {
    expect(splitDeliveryTiers([{ toKm: 15, fee: '80000' }])).toEqual({
      freeWithinKm: null,
      paid: [{ fromKm: 0, toKm: 15, fee: '80000', free: false }],
    });
  });
});

describe('pickupAddress — địa chỉ đầy đủ, không chỉ tên tỉnh', () => {
  it('ghép số nhà · phường · tỉnh', () => {
    expect(pickupAddress(carReview().pickup)).toBe(
      '25 Hùng Vương, Phường Phú Nhuận, Thành phố Huế',
    );
  });

  it('chi nhánh cũ chỉ có chuỗi ghép sẵn: dùng chuỗi đó thay vì chỉ in tên tỉnh', () => {
    const pickup = {
      ...carReview().pickup!,
      addressLine: null,
      address: '12 Lê Lợi, Huế',
    };
    expect(pickupAddress(pickup)).toBe('12 Lê Lợi, Huế');
  });

  it('không có điểm nhận → null', () => {
    expect(pickupAddress(null)).toBeNull();
  });
});

describe('hasApprovalBlockers', () => {
  it('không lệch gì ⇒ duyệt được', () => {
    expect(hasApprovalBlockers({ changedLockedFields: [], missingRequirements: [] })).toBe(false);
  });

  it('sửa một trường căn cước, hoặc rớt một điều kiện lên chợ ⇒ chưa duyệt được', () => {
    expect(
      hasApprovalBlockers({ changedLockedFields: ['plateNumber'], missingRequirements: [] }),
    ).toBe(true);
    expect(hasApprovalBlockers({ changedLockedFields: [], missingRequirements: ['photos'] })).toBe(
      true,
    );
  });
});
