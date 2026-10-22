import { describe, expect, it } from 'vitest';
import { buildExternalDriverSchema } from './external-driver';

const schema = buildExternalDriverSchema({
  nameRequired: 'NAME_REQUIRED',
  nameLength: 'NAME_LENGTH',
  phoneRequired: 'PHONE_REQUIRED',
  phoneInvalid: 'PHONE_INVALID',
});

async function errorOf(value: { name: string; phone: string }): Promise<string | undefined> {
  try {
    await schema.validate(value);
    return undefined;
  } catch (err) {
    return (err as { message: string }).message;
  }
}

describe('buildExternalDriverSchema (ADR 0067)', () => {
  it('nhận tên đã cắt khoảng trắng và SĐT có dấu cách / +84', async () => {
    await expect(
      schema.validate({ name: '  Nguyễn Văn Tài ', phone: '0912 345 678' }),
    ).resolves.toEqual({ name: 'Nguyễn Văn Tài', phone: '0912345678' });
    await expect(errorOf({ name: 'An', phone: '+84912345678' })).resolves.toBeUndefined();
  });

  it('tên trống / quá ngắn / quá dài', async () => {
    await expect(errorOf({ name: '   ', phone: '0912345678' })).resolves.toBe('NAME_REQUIRED');
    await expect(errorOf({ name: ' A ', phone: '0912345678' })).resolves.toBe('NAME_LENGTH');
    await expect(errorOf({ name: 'A'.repeat(121), phone: '0912345678' })).resolves.toBe(
      'NAME_LENGTH',
    );
  });

  it('SĐT bắt buộc và phải là số di động VN', async () => {
    await expect(errorOf({ name: 'Tài', phone: '' })).resolves.toBe('PHONE_REQUIRED');
    await expect(errorOf({ name: 'Tài', phone: '12345' })).resolves.toBe('PHONE_INVALID');
    await expect(errorOf({ name: 'Tài', phone: '02838123456' })).resolves.toBe('PHONE_INVALID');
  });
});
