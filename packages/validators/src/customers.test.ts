import {
  TENANT_CUSTOMER_FIELD_MAX,
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
} from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import type { AnyObjectSchema } from 'yup';
import { customerFormSchema, customerNoteSchema, customerRiskSchema } from './index';

/**
 * Lấy MÃ lỗi của một field — `useValidationResolver` tra `Customers.validation.<mã>`.
 *
 * `AnyObjectSchema` chứ không phải một hình dạng tự khai: `ObjectSchema` của yup mang bốn tham
 * số generic, và một chữ ký viết tay không bao giờ khớp cả ba schema ở dưới.
 */
async function errorFor(schema: AnyObjectSchema, value: unknown): Promise<string | null> {
  try {
    await schema.validate(value, { abortEarly: true });
    return null;
  } catch (error) {
    return (error as { message?: string }).message ?? null;
  }
}

/**
 * Schema DÙNG CHUNG web ↔ app native. Message là MÃ, không phải câu — chép schema xuống một
 * client là dựng bản thứ hai của cùng một luật, mà luật ở đây phải khớp `class-validator` của DTO
 * backend và CHECK ở DB.
 */
describe('customerFormSchema', () => {
  it('nhận hồ sơ đủ tên + SĐT; email/địa chỉ để trống được', async () => {
    const value = await customerFormSchema.validate({
      fullName: 'Nguyễn Văn An',
      phone: '0901234567',
      email: '',
      address: '',
    });
    expect(value.fullName).toBe('Nguyễn Văn An');
    expect(value.email).toBe('');
  });

  it('thiếu tên → mã `fullNameRequired`', async () => {
    expect(await errorFor(customerFormSchema, { fullName: '', phone: '0901234567' })).toBe(
      'fullNameRequired',
    );
  });

  it('thiếu SĐT → mã `phoneRequired`', async () => {
    expect(await errorFor(customerFormSchema, { fullName: 'An', phone: '' })).toBe('phoneRequired');
  });

  it('SĐT sai định dạng bị chặn NGAY ở client, không đợi backend', async () => {
    expect(await errorFor(customerFormSchema, { fullName: 'An', phone: '12345' })).toBe(
      'phoneInvalid',
    );
  });

  it('email rỗng KHÔNG phải lỗi — trường không bắt buộc', async () => {
    expect(
      await errorFor(customerFormSchema, { fullName: 'An', phone: '0901234567', email: '' }),
    ).toBeNull();
  });

  it('email có giá trị nhưng sai → mã `emailInvalid`', async () => {
    expect(
      await errorFor(customerFormSchema, { fullName: 'An', phone: '0901234567', email: 'an@' }),
    ).toBe('emailInvalid');
  });

  it('tên quá 255 ký tự → mã `fullNameMax` (khớp `@Length(1, 255)` của DTO)', async () => {
    expect(
      await errorFor(customerFormSchema, { fullName: 'a'.repeat(256), phone: '0901234567' }),
    ).toBe('fullNameMax');
  });

  it('địa chỉ quá 500 ký tự → mã `addressMax` (khớp `@MaxLength(500)` của DTO)', async () => {
    expect(
      await errorFor(customerFormSchema, {
        fullName: 'An',
        phone: '0901234567',
        address: 'a'.repeat(501),
      }),
    ).toBe('addressMax');
  });
});

/**
 * Lý do BẮT BUỘC khi khác `normal` — cùng luật với DTO backend và với CHECK
 * `tenant_customers_risk_reason_required_check` ở DB, nên ba lớp không thể lệch nhau.
 */
describe('customerRiskSchema', () => {
  it('`normal` KHÔNG cần lý do', async () => {
    expect(
      await errorFor(customerRiskSchema, {
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
        reason: '',
      }),
    ).toBeNull();
  });

  it('`watchlist` thiếu lý do → mã `reasonRequired`', async () => {
    expect(
      await errorFor(customerRiskSchema, {
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST,
        reason: '',
      }),
    ).toBe('reasonRequired');
  });

  it('`blocked` thiếu lý do → mã `reasonRequired`', async () => {
    expect(
      await errorFor(customerRiskSchema, {
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
        reason: '   ',
      }),
    ).toBe('reasonRequired');
  });

  it('`blocked` có lý do thì qua', async () => {
    expect(
      await errorFor(customerRiskSchema, {
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
        reason: 'Trả xe muộn 2 lần',
      }),
    ).toBeNull();
  });

  it('lý do quá 1000 ký tự → mã `reasonMax` (khớp `@MaxLength(1000)` của DTO)', async () => {
    expect(
      await errorFor(customerRiskSchema, {
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
        reason: 'a'.repeat(1001),
      }),
    ).toBe('reasonMax');
  });
});

describe('customerNoteSchema', () => {
  it('nội dung rỗng → mã `noteBodyRequired`', async () => {
    expect(
      await errorFor(customerNoteSchema, {
        noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
        body: '  ',
      }),
    ).toBe('noteBodyRequired');
  });

  it('nội dung quá 2000 ký tự → mã `noteBodyMax` (khớp `@Length(1, 2000)` của DTO)', async () => {
    expect(
      await errorFor(customerNoteSchema, {
        noteType: TENANT_CUSTOMER_NOTE_TYPE.RISK,
        body: 'a'.repeat(2001),
      }),
    ).toBe('noteBodyMax');
  });

  it('mặc định là ghi chú chung', async () => {
    const value = await customerNoteSchema.validate({ body: 'khách quen' });
    expect(value.noteType).toBe(TENANT_CUSTOMER_NOTE_TYPE.GENERAL);
  });
});

/**
 * Trần độ dài đến TỪ `@xeprime/types`, không gõ lại ở từng lớp.
 *
 * Bài test này khoá đúng chỗ đã sửa: trước đó cùng con số được gõ tay ở schema, ở `maxLength` của
 * ô nhập trên web/app native và ở `@MaxLength` của DTO. Ba bản chỉ cần lệch một lần là người dùng
 * gõ vừa đủ ô nhập cho phép rồi bị server từ chối mà không hiểu vì sao.
 */
describe('trần độ dài đọc từ TENANT_CUSTOMER_FIELD_MAX', () => {
  it('đúng trần thì qua, hơn một ký tự thì mã lỗi tương ứng', async () => {
    const base = { fullName: 'A', phone: '0901234567' };

    expect(
      await errorFor(customerFormSchema, {
        ...base,
        fullName: 'a'.repeat(TENANT_CUSTOMER_FIELD_MAX.FULL_NAME),
      }),
    ).toBeNull();
    expect(
      await errorFor(customerFormSchema, {
        ...base,
        fullName: 'a'.repeat(TENANT_CUSTOMER_FIELD_MAX.FULL_NAME + 1),
      }),
    ).toBe('fullNameMax');

    expect(
      await errorFor(customerFormSchema, {
        ...base,
        address: 'a'.repeat(TENANT_CUSTOMER_FIELD_MAX.ADDRESS + 1),
      }),
    ).toBe('addressMax');

    expect(
      await errorFor(customerNoteSchema, {
        noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
        body: 'a'.repeat(TENANT_CUSTOMER_FIELD_MAX.NOTE_BODY + 1),
      }),
    ).toBe('noteBodyMax');

    expect(
      await errorFor(customerRiskSchema, {
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.BLOCKED,
        reason: 'a'.repeat(TENANT_CUSTOMER_FIELD_MAX.RISK_REASON + 1),
      }),
    ).toBe('reasonMax');
  });
});
