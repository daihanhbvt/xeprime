import { assessRegistrationReading } from '@xeprime/types';
import type { OcrLine } from '../src/modules/driver-licences/reader/licence-text';
import {
  analyseRegistrationPass,
  mergeRegistrationPasses,
  registrationLabelScore,
} from '../src/modules/vehicles/registration/registration-text';

/** Chữ thô → các dòng OCR, mỗi từ cùng một độ tin cậy. */
function ocr(text: string, confidence = 90): OcrLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).map((word) => ({ text: word, confidence })));
}

/** Cà vẹt mẫu xanh cũ — nhãn song ngữ, giá trị cùng dòng. */
const BLUE_CARD = `CÔNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM
GIẤY CHỨNG NHẬN ĐĂNG KÝ XE Ô TÔ
Tên chủ xe (Owner's full name): NGUYỄN VĂN AN
Địa chỉ (Address): 123 Nguyễn Văn Cừ, Quận 5, TP Hồ Chí Minh
Nhãn hiệu (Brand): TOYOTA Số loại (Model code): VIOS
Số máy (Engine N°): 2NR X123456
Số khung (Chassis N°): RL4B29F30K1234567
Biển số đăng ký (Number plate): 51H-100.00`;

/** Mẫu thẻ 2023 — giá trị in xuống dòng dưới nhãn. */
const CARD_2023 = `CHỨNG NHẬN ĐĂNG KÝ XE Ô TÔ
Tên chủ xe
TRẦN THỊ BÌNH
Số máy
G4LC AB12345
Số khung
KNADC512AL6123456
Biển số đăng ký
30A-46738`;

describe('registration-text — đọc chữ cà vẹt (ADR 0089)', () => {
  it('đọc đủ năm trường trên mẫu xanh cũ, cắt giá trị trước nhãn kế tiếp cùng dòng', () => {
    const pass = analyseRegistrationPass(ocr(BLUE_CARD));
    expect(pass.holderName?.value).toBe('NGUYỄN VĂN AN');
    expect(pass.holderAddress?.value).toBe('123 Nguyễn Văn Cừ, Quận 5, TP Hồ Chí Minh');
    expect(pass.engineNumber?.value).toBe('2NRX123456');
    expect(pass.chassisNumber?.value).toBe('RL4B29F30K1234567');
    expect(pass.plateNumber?.value).toBe('51H-100.00');
  });

  it('mẫu thẻ in giá trị xuống dòng dưới nhãn', () => {
    const pass = analyseRegistrationPass(ocr(CARD_2023));
    expect(pass.holderName?.value).toBe('TRẦN THỊ BÌNH');
    expect(pass.engineNumber?.value).toBe('G4LCAB12345');
    expect(pass.chassisNumber?.value).toBe('KNADC512AL6123456');
    expect(pass.plateNumber?.value).toBe('30A-467.38');
  });

  it('VIN 17 ký tự: O/Q đọc nhầm về số 0, I về số 1', () => {
    const pass = analyseRegistrationPass(ocr('Số khung (Chassis N°): RL4B29F3OKI234567'));
    expect(pass.chassisNumber?.value).toBe('RL4B29F30K1234567');
  });

  it('giá trị sai hình dạng thì coi như không đọc được, không đoán', () => {
    const pass = analyseRegistrationPass(
      ocr(`Tên chủ xe: AN
Số khung: ABC
Số máy: KHONGCOSO
Biển số đăng ký: không rõ`),
    );
    expect(pass.holderName).toBeUndefined();
    expect(pass.chassisNumber).toBeUndefined();
    expect(pass.engineNumber).toBeUndefined();
    expect(pass.plateNumber).toBeUndefined();
  });

  it('bỏ phiếu: hai lượt đọc giống nhau thì nhận, một lượt điểm thấp thì để trống', () => {
    const good = analyseRegistrationPass(ocr(BLUE_CARD));
    const noisy = analyseRegistrationPass(
      ocr(BLUE_CARD.replace('RL4B29F30K1234567', 'RL4B29F80K1234567')),
    );
    const merged = mergeRegistrationPasses([good, good, noisy]);
    expect(merged.chassisNumber).toBe('RL4B29F30K1234567');

    const lonely = mergeRegistrationPasses([analyseRegistrationPass(ocr(BLUE_CARD, 60)), {}, {}]);
    expect(lonely.chassisNumber).toBeNull();
    expect(lonely.holderName).toBeNull();
  });

  it('một lượt duy nhất nhưng Tesseract chấm rất cao thì vẫn nhận', () => {
    const merged = mergeRegistrationPasses([analyseRegistrationPass(ocr(BLUE_CARD, 95)), {}, {}]);
    expect(merged.engineNumber).toBe('2NRX123456');
  });

  it('điểm nhãn chọn chiều xoay: ảnh không phải cà vẹt có điểm 0', () => {
    expect(registrationLabelScore(ocr(BLUE_CARD))).toBeGreaterThanOrEqual(4);
    expect(registrationLabelScore(ocr('Hoá đơn bán lẻ\nTổng cộng 120.000'))).toBe(0);
  });
});

describe('assessRegistrationReading — đủ để lưu hay phải nhập tay', () => {
  const full = {
    plateNumber: '51H-100.00',
    holderName: 'NGUYỄN VĂN AN',
    holderAddress: null,
    chassisNumber: 'RL4B29F30K1234567',
    engineNumber: '2NRX123456',
  };

  it('đủ ba trường bắt buộc + biển số khớp (bỏ qua dấu, hoa thường) ⇒ đủ', () => {
    expect(assessRegistrationReading(full, '51h 10000')).toEqual({
      complete: true,
      missing: [],
      plateMismatch: false,
    });
  });

  it('thiếu trường bắt buộc ⇒ liệt kê để nhập tay', () => {
    const result = assessRegistrationReading({ ...full, engineNumber: null }, null);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['engineNumber']);
  });

  it('biển số trên cà vẹt khác biển đã nhập ⇒ không tự lưu', () => {
    expect(assessRegistrationReading(full, '51H-999.99').plateMismatch).toBe(true);
    expect(assessRegistrationReading(full, '51H-999.99').complete).toBe(false);
  });

  it('chưa đọc được gì ⇒ thiếu cả ba', () => {
    expect(assessRegistrationReading(null, null).missing).toHaveLength(3);
  });
});
