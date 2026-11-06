import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterCheckDto } from '../src/modules/auth/dto/auth.dto';
import { CreateBookingRequestDto } from '../src/modules/booking-requests/dto/booking-request.dto';
import { InviteDriverDto } from '../src/modules/drivers/dto/driver.dto';
import { SendOtpDto } from '../src/modules/phone-verification/dto/phone-verification.dto';

/**
 * ADR 0082 — mép DTO: chỉ chữ số + `+` đầu; SĐT tài khoản chỉ di động; SĐT liên hệ thêm số bàn
 * `02`; mọi dạng hợp lệ quy về `0…`. Không cần DB.
 */
function parse<T extends object>(cls: new () => T, body: object, field: string) {
  const dto = plainToInstance(cls, body);
  const err = validateSync(dto).find((e) => e.property === field);
  return { value: (dto as Record<string, unknown>)[field], ok: !err };
}

/** Hợp lệ ở MỌI ô SĐT. */
const MOBILE_CASES: Array<[string, string]> = [
  ['0901234567', '0901234567'],
  ['84901234567', '0901234567'],
  ['+84901234567', '0901234567'],
  ['  0901234567  ', '0901234567'],
];

/** Bị chặn ở MỌI ô SĐT. */
const INVALID_EVERYWHERE = [
  '090 123 4567',
  '090.123.4567',
  '090-123-4567',
  '+84 90 123 4567',
  '901234567',
  '09012345678',
  '8490123456',
  '84012345678',
  '0123456789',
  '+840901234567',
  '840901234567',
  'abc',
];

describe('@PhoneInput() — SĐT TÀI KHOẢN (chỉ di động)', () => {
  it.each(MOBILE_CASES)('RegisterCheckDto.phone %j → %s', (raw, expected) => {
    const body = { displayName: 'A', password: 'matkhau123', phone: raw };
    expect(parse(RegisterCheckDto, body, 'phone')).toEqual({ value: expected, ok: true });
  });

  it.each(MOBILE_CASES)('SendOtpDto.phone %j → %s', (raw, expected) => {
    expect(parse(SendOtpDto, { phone: raw }, 'phone')).toEqual({ value: expected, ok: true });
  });

  it.each(MOBILE_CASES)('InviteDriverDto.phone %j → %s', (raw, expected) => {
    expect(parse(InviteDriverDto, { phone: raw }, 'phone')).toEqual({ value: expected, ok: true });
  });

  it.each([...INVALID_EVERYWHERE, '02438123456', '842438123456'])('chặn %j', (raw) => {
    expect(parse(SendOtpDto, { phone: raw }, 'phone').ok).toBe(false);
    expect(parse(InviteDriverDto, { phone: raw }, 'phone').ok).toBe(false);
    expect(parse(RegisterCheckDto, { phone: raw }, 'phone').ok).toBe(false);
  });

  it('giá trị không phải chuỗi không làm transform sập', () => {
    expect(parse(SendOtpDto, { phone: 901234567 }, 'phone').ok).toBe(false);
  });
});

describe('@PhoneInput() — SĐT LIÊN HỆ (di động + số bàn 02)', () => {
  it.each([...MOBILE_CASES, ['02438123456', '02438123456'], ['842438123456', '02438123456']])(
    'CreateBookingRequestDto.customerPhone %j → %s',
    (raw, expected) => {
      expect(parse(CreateBookingRequestDto, { customerPhone: raw }, 'customerPhone')).toEqual({
        value: expected,
        ok: true,
      });
    },
  );

  it.each(INVALID_EVERYWHERE)('chặn %j', (raw) => {
    expect(parse(CreateBookingRequestDto, { customerPhone: raw }, 'customerPhone').ok).toBe(false);
  });
});
