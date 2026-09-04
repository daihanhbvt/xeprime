import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/services/api-client';
import { parseApiFieldIssues } from './api-field-errors';

function validationError(details: unknown): ApiClientError {
  return new ApiClientError({
    code: 'VALIDATION_FAILED',
    message: 'Dữ liệu gửi lên không hợp lệ',
    status: 400,
    details,
  });
}

describe('parseApiFieldIssues', () => {
  it('đọc được hình dạng của pipe validate toàn cục (mảng field + constraints)', () => {
    const issues = parseApiFieldIssues(
      validationError([
        {
          field: 'fuelConsumptionCity',
          constraints: ['fuelConsumptionCity must be a number conforming to the specified constraints'],
        },
      ]),
    );
    expect(issues).toEqual([
      {
        field: 'fuelConsumptionCity',
        detail: 'fuelConsumptionCity must be a number conforming to the specified constraints',
      },
    ]);
  });

  it('đọc được hình dạng validate viết tay ({ fields: [{ field, message }] })', () => {
    const issues = parseApiFieldIssues(
      validationError({ fields: [{ field: 'expiresAt', message: 'Ngày hết hạn không được trước ngày cấp' }] }),
    );
    expect(issues).toEqual([
      { field: 'expiresAt', detail: 'Ngày hết hạn không được trước ngày cấp' },
    ]);
  });

  it('giữ đường dẫn chấm của trường lồng — đó là thứ gắn được vào ô của react-hook-form', () => {
    const issues = parseApiFieldIssues(
      validationError([{ field: 'deliveryTiers.0.toKm', constraints: ['toKm sai'] }]),
    );
    expect(issues.map((i) => i.field)).toEqual(['deliveryTiers.0.toKm']);
  });

  it('một trường vi phạm nhiều ràng buộc chỉ ra MỘT lỗi — ô nhập chỉ hiện được một', () => {
    const issues = parseApiFieldIssues(
      validationError([
        { field: 'seatCount', constraints: ['phải là số nguyên'] },
        { field: 'seatCount', constraints: ['tối đa 64'] },
      ]),
    );
    expect(issues).toEqual([{ field: 'seatCount', detail: 'phải là số nguyên' }]);
  });

  it('lỗi không phải loại validate, details lạ, hoặc lỗi thường → rỗng, không ném', () => {
    expect(parseApiFieldIssues(new Error('bùm'))).toEqual([]);
    expect(parseApiFieldIssues(null)).toEqual([]);
    expect(parseApiFieldIssues(validationError(undefined))).toEqual([]);
    expect(parseApiFieldIssues(validationError('không phải mảng'))).toEqual([]);
    expect(parseApiFieldIssues(validationError([{ constraints: ['thiếu field'] }]))).toEqual([]);
  });
});
