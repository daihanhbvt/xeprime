import { describe, expect, it } from 'vitest';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  fieldsFromReading,
  registrationAutoFilled,
  type RegistrationCaptureState,
} from './registration-capture';

const READING = {
  plateNumber: '51H-100.00',
  holderName: 'NGUYỄN VĂN AN',
  holderAddress: null,
  chassisNumber: 'RL4B29F30K1234567',
  engineNumber: '2NRX123456',
};

const ready = (overrides: Partial<RegistrationCaptureState> = {}): RegistrationCaptureState => ({
  ...EMPTY_REGISTRATION,
  phase: 'ready',
  uploadId: '01JREGISTRATIONUPLOAD00001',
  reading: READING,
  readerAvailable: true,
  fields: fieldsFromReading(READING),
  ...overrides,
});

describe('registration-capture (ADR 0089)', () => {
  it('chưa có ảnh ⇒ thiếu ảnh + ba trường bắt buộc', () => {
    const check = checkRegistration(EMPTY_REGISTRATION, null);
    expect(check.ok).toBe(false);
    expect(check.errors).toMatchObject({
      photo: 'photoRequired',
      holderName: 'holderNameRequired',
      chassisNumber: 'chassisRequired',
      engineNumber: 'engineRequired',
    });
  });

  it('đang tải/đọc ⇒ chưa cho đi tiếp', () => {
    expect(checkRegistration({ ...ready(), phase: 'working' }, null).errors.photo).toBe(
      'photoNotReady',
    );
  });

  it('máy đọc đủ + biển khớp ⇒ tự lưu (chỉ hiện tóm tắt) và payload chuẩn hoá mã', () => {
    const state = ready({
      fields: { ...fieldsFromReading(READING), chassisNumber: 'rl4b 29f30k1234567' },
    });
    expect(registrationAutoFilled(ready(), '51H 100.00')).toBe(true);
    const check = checkRegistration(state, '51H-100.00');
    expect(check.ok).toBe(true);
    expect(check.input).toEqual({
      uploadId: '01JREGISTRATIONUPLOAD00001',
      holderName: 'NGUYỄN VĂN AN',
      chassisNumber: 'RL4B29F30K1234567',
      engineNumber: '2NRX123456',
      holderAddress: null,
      plateNumber: '51H-100.00',
    });
  });

  it('biển số lệch hoặc chủ xe tự mở sửa ⇒ nhập tay', () => {
    expect(registrationAutoFilled(ready(), '51H-999.99')).toBe(false);
    expect(registrationAutoFilled(ready({ editing: true }), null)).toBe(false);
  });

  it('máy đọc thiếu số máy ⇒ không tự lưu, bắt nhập số máy', () => {
    const reading = { ...READING, engineNumber: null };
    const state = ready({ reading, fields: fieldsFromReading(reading) });
    expect(registrationAutoFilled(state, null)).toBe(false);
    expect(checkRegistration(state, null).errors).toEqual({ engineNumber: 'engineRequired' });
  });

  it('mã sai hình dạng ⇒ lỗi định dạng', () => {
    const state = ready({
      fields: { ...fieldsFromReading(READING), chassisNumber: 'AB1', engineNumber: 'X' },
    });
    expect(checkRegistration(state, null).errors).toEqual({
      chassisNumber: 'chassisInvalid',
      engineNumber: 'engineInvalid',
    });
  });
});
