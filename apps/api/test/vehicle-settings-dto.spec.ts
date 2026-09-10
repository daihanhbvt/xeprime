import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AUTO_ACCEPT_LEAD_MAX_MINUTES,
  CUSTOMER_DOCUMENT_TYPE,
  DRIVER_DEPOSIT_MODE,
  DRIVER_SURCHARGE_KIND,
  DRIVER_SURCHARGE_THRESHOLD_MAX,
  HANDOVER_WINDOW_MAX_PER_KIND,
  IDENTITY_VERIFY_METHOD,
  MIN_RENTAL_MINUTES_RANGE,
  RENTAL_TERMS_MAX_LENGTH,
  ROUTE_TYPE,
} from '@xeprime/types';
import {
  PatchVehicleServiceSettingDto,
  SaveDriverSurchargeRulesDto,
  SaveVehicleOperationSettingsDto,
  VehicleTripHistoryQueryDto,
} from '../src/modules/vehicle-settings/dto/vehicle-settings.dto';

/**
 * LỚP CHẶN Ở MÉP VÀO của thiết lập vận hành theo xe — thuần DTO, không cần database.
 *
 * Vì sao đáng một spec riêng: những trường này đi thẳng vào cột có CHECK ở DB. Nếu DTO để lọt,
 * người dùng nhận lỗi 500 từ Postgres thay vì một câu nói rõ sai ở đâu — và một client khác
 * (app native) có thể ghi được giá trị mà giao diện web không bao giờ sinh ra.
 *
 * Ba nhóm được khoá: định dạng giờ `HH:mm`, khoảng số (đệm/đặt trước/thời lượng/ngưỡng), và
 * TIỀN luôn là chuỗi thập phân — không bao giờ `number` (ADR 0007).
 */
function errorsOf<T extends object>(cls: new () => T, payload: unknown): Record<string, string[]> {
  const dto = plainToInstance(cls, payload);
  const out: Record<string, string[]> = {};
  const walk = (list: ReturnType<typeof validateSync>, prefix = '') => {
    for (const e of list) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) out[path] = Object.values(e.constraints);
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }));
  return out;
}

const okOperation = {
  turnaroundBufferMinutes: 60,
  pickupWindows: [{ start: '06:00', end: '22:00' }],
  returnWindows: [{ start: '06:00', end: '24:00' }],
};

describe('SaveVehicleOperationSettingsDto — khung giờ và thời gian chết', () => {
  it('nhận payload hợp lệ, kể cả 24:00 (hết ngày) và danh sách rỗng', () => {
    expect(errorsOf(SaveVehicleOperationSettingsDto, okOperation)).toEqual({});
    expect(
      errorsOf(SaveVehicleOperationSettingsDto, {
        turnaroundBufferMinutes: 0,
        pickupWindows: [],
        returnWindows: [],
      }),
    ).toEqual({});
  });

  it('giờ sai định dạng bị chặn ngay ở DTO, không xuống tới CHECK của Postgres', () => {
    for (const bad of ['6:00', '25:00', '06:60', '0600', '06:00:00', '']) {
      const errors = errorsOf(SaveVehicleOperationSettingsDto, {
        ...okOperation,
        pickupWindows: [{ start: bad, end: '22:00' }],
      });
      expect(Object.keys(errors)).toContain('pickupWindows.0.start');
    }
  });

  it('đệm âm hoặc quá một ngày bị từ chối; số thập phân cũng vậy', () => {
    for (const bad of [-1, 1441, 30.5]) {
      const errors = errorsOf(SaveVehicleOperationSettingsDto, {
        ...okOperation,
        turnaroundBufferMinutes: bad,
      });
      expect(errors.turnaroundBufferMinutes).toBeDefined();
    }
  });

  it('không nhận quá số khung giờ tối đa mỗi loại', () => {
    const many = Array.from({ length: HANDOVER_WINDOW_MAX_PER_KIND + 1 }, (_, i) => ({
      start: `0${i}:00`,
      end: `0${i}:30`,
    }));
    const errors = errorsOf(SaveVehicleOperationSettingsDto, {
      ...okOperation,
      pickupWindows: many,
    });
    expect(errors.pickupWindows).toBeDefined();
  });
});

describe('PatchVehicleServiceSettingDto — đặt trước, thời lượng, giấy tờ, điều khoản', () => {
  it('payload rỗng hợp lệ — PATCH chỉ đụng trường được gửi', () => {
    expect(errorsOf(PatchVehicleServiceSettingDto, {})).toEqual({});
  });

  it('khoảng đặt trước nằm trong [0, trần]; vượt trần bị chặn', () => {
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        autoAcceptMinLeadMinutes: 0,
        autoAcceptMaxLeadMinutes: AUTO_ACCEPT_LEAD_MAX_MINUTES,
      }),
    ).toEqual({});
    const errors = errorsOf(PatchVehicleServiceSettingDto, {
      autoAcceptMinLeadMinutes: -1,
      autoAcceptMaxLeadMinutes: AUTO_ACCEPT_LEAD_MAX_MINUTES + 1,
    });
    expect(errors.autoAcceptMinLeadMinutes).toBeDefined();
    expect(errors.autoAcceptMaxLeadMinutes).toBeDefined();
  });

  it('thời lượng tối thiểu phải nằm trong dải giờ có nghĩa', () => {
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        minRentalMinutes: MIN_RENTAL_MINUTES_RANGE.min,
      }),
    ).toEqual({});
    for (const bad of [MIN_RENTAL_MINUTES_RANGE.min - 1, MIN_RENTAL_MINUTES_RANGE.max + 1]) {
      expect(errorsOf(PatchVehicleServiceSettingDto, { minRentalMinutes: bad })
        .minRentalMinutes).toBeDefined();
    }
  });

  it('lộ trình ưu tiên chỉ nhận mã ROUTE_TYPE thật và không trùng', () => {
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        preferredRouteTypes: [ROUTE_TYPE.IN_CITY, ROUTE_TYPE.INTER_CITY],
      }),
    ).toEqual({});
    expect(
      errorsOf(PatchVehicleServiceSettingDto, { preferredRouteTypes: ['airport_transfer'] })
        .preferredRouteTypes,
    ).toBeDefined();
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        preferredRouteTypes: [ROUTE_TYPE.IN_CITY, ROUTE_TYPE.IN_CITY],
      }).preferredRouteTypes,
    ).toBeDefined();
  });

  it('"giấy tờ khác" không nằm trong tập cấu hình được', () => {
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        requiredDocuments: [CUSTOMER_DOCUMENT_TYPE.PASSPORT],
      }),
    ).toEqual({});
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        requiredDocuments: [CUSTOMER_DOCUMENT_TYPE.OTHER],
      }).requiredDocuments,
    ).toBeDefined();
  });

  it('cách đối chiếu chỉ nhận hai phương thức THỦ CÔNG đã định nghĩa', () => {
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        identityVerifyMethod: IDENTITY_VERIFY_METHOD.VNEID,
      }),
    ).toEqual({});
    expect(
      errorsOf(PatchVehicleServiceSettingDto, { identityVerifyMethod: 'api_vneid' })
        .identityVerifyMethod,
    ).toBeDefined();
  });

  it('điều khoản có trần độ dài', () => {
    expect(
      errorsOf(PatchVehicleServiceSettingDto, { termsText: 'x'.repeat(RENTAL_TERMS_MAX_LENGTH) }),
    ).toEqual({});
    expect(
      errorsOf(PatchVehicleServiceSettingDto, {
        termsText: 'x'.repeat(RENTAL_TERMS_MAX_LENGTH + 1),
      }).termsText,
    ).toBeDefined();
  });

  it('chỉ nhận chế độ cọc hệ thống THU được — 30%/50% bị từ chối ngay ở DTO', () => {
    expect(errorsOf(PatchVehicleServiceSettingDto, { depositMode: DRIVER_DEPOSIT_MODE.NONE }))
      .toEqual({});
    for (const bad of [DRIVER_DEPOSIT_MODE.PERCENT_30, DRIVER_DEPOSIT_MODE.PERCENT_50]) {
      expect(errorsOf(PatchVehicleServiceSettingDto, { depositMode: bad }).depositMode)
        .toBeDefined();
    }
  });

  it('trường lạ bị loại — client không tự thêm cột', () => {
    expect(
      Object.keys(errorsOf(PatchVehicleServiceSettingDto, { tenantId: 'X', commissionPercent: 10 })),
    ).toEqual(expect.arrayContaining(['tenantId', 'commissionPercent']));
  });
});

describe('SaveDriverSurchargeRulesDto — tiền là CHUỖI, ngưỡng có trần', () => {
  const rule = (over: Record<string, unknown> = {}) => ({
    items: [
      {
        kind: DRIVER_SURCHARGE_KIND.OVERTIME,
        enabled: true,
        amount: '80000',
        thresholdValue: 1320,
        ...over,
      },
    ],
  });

  it('nhận chuỗi tiền hợp lệ, kể cả phần lẻ hai chữ số', () => {
    expect(errorsOf(SaveDriverSurchargeRulesDto, rule())).toEqual({});
    expect(errorsOf(SaveDriverSurchargeRulesDto, rule({ amount: '80000.50' }))).toEqual({});
  });

  it('tiền dạng số hoặc chuỗi không phải số bị chặn (ADR 0007)', () => {
    for (const bad of [80000, '80.000', '80,000', '-1', 'nhiều', '']) {
      const errors = errorsOf(SaveDriverSurchargeRulesDto, rule({ amount: bad }));
      expect(Object.keys(errors).some((k) => k.endsWith('amount'))).toBe(true);
    }
  });

  it('ngưỡng phải là số nguyên trong [0, trần]', () => {
    expect(errorsOf(SaveDriverSurchargeRulesDto, rule({ thresholdValue: 0 }))).toEqual({});
    expect(
      errorsOf(SaveDriverSurchargeRulesDto, rule({ thresholdValue: DRIVER_SURCHARGE_THRESHOLD_MAX })),
    ).toEqual({});
    for (const bad of [-1, DRIVER_SURCHARGE_THRESHOLD_MAX + 1, 10.5]) {
      const errors = errorsOf(SaveDriverSurchargeRulesDto, rule({ thresholdValue: bad }));
      expect(Object.keys(errors).some((k) => k.endsWith('thresholdValue'))).toBe(true);
    }
  });

  it('loại phụ phí lạ bị chặn', () => {
    const errors = errorsOf(SaveDriverSurchargeRulesDto, rule({ kind: 'toll' }));
    expect(Object.keys(errors).some((k) => k.endsWith('kind'))).toBe(true);
  });
});

describe('VehicleTripHistoryQueryDto — phân trang có trần', () => {
  it('nhận bộ lọc hợp lệ và ép kiểu số từ query string', () => {
    const dto = plainToInstance(VehicleTripHistoryQueryDto, {
      page: '2',
      limit: '20',
      filter: 'completed',
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(20);
  });

  it('client không tự nâng trần trang — limit vượt ngưỡng bị từ chối', () => {
    expect(errorsOf(VehicleTripHistoryQueryDto, { limit: 500 }).limit).toBeDefined();
    expect(errorsOf(VehicleTripHistoryQueryDto, { page: 0 }).page).toBeDefined();
  });

  it('bộ lọc lạ bị từ chối', () => {
    expect(errorsOf(VehicleTripHistoryQueryDto, { filter: 'ongoing' }).filter).toBeDefined();
  });
});
