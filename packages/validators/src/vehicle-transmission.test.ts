import { describe, expect, it } from 'vitest';
import { vehicleFormSchema } from './index';

/**
 * Ô "Hộp số" của form xe.
 *
 * Bài test này khoá một lỗi ĐÃ XẢY RA ngoài production: form dựng lựa chọn từ
 * `vehicleTransmissionTypesFor` (có `direct_drive` cho xe điện, `automatic_cvt`/`manual_clutch`
 * cho xe máy) trong khi schema chỉ nhận năm mã cũ. Người dùng chọn đúng thứ form mời họ chọn rồi
 * bị chặn bằng câu mặc định của yup — không dịch được và không nói được phải làm gì.
 *
 * Hai vế được kiểm ở đây là hai vế của cùng một luật: mã phải NẰM TRONG bộ mở rộng, và phải HỢP
 * với cặp (loại xe, nguồn năng lượng) — cùng ma trận `isTransmissionAllowedFor` mà backend dùng.
 */
async function transmissionError(values: {
  vehicleType: string;
  fuelType: string | null;
  transmission: string | null;
}): Promise<string | undefined> {
  try {
    await vehicleFormSchema.validateAt('transmission', values as never);
    return undefined;
  } catch (err) {
    return (err as { message?: string }).message;
  }
}

describe('vehicleFormSchema.transmission', () => {
  it('xe ĐIỆN nhận truyền động một cấp — mã mà bộ cũ không có', async () => {
    expect(
      await transmissionError({
        vehicleType: 'car',
        fuelType: 'electric',
        transmission: 'direct_drive',
      }),
    ).toBeUndefined();
  });

  it('xe máy nhận ba kiểu của riêng nó', async () => {
    for (const transmission of ['automatic_cvt', 'semi_automatic', 'manual_clutch']) {
      expect(
        await transmissionError({ vehicleType: 'motorbike', fuelType: 'gasoline', transmission }),
      ).toBeUndefined();
    }
  });

  it('ô tô xăng vẫn nhận bộ cũ — dữ liệu và client cũ không vỡ', async () => {
    for (const transmission of ['automatic', 'manual', 'cvt', 'dct', 'other']) {
      expect(
        await transmissionError({ vehicleType: 'car', fuelType: 'gasoline', transmission }),
      ).toBeUndefined();
    }
  });

  it('sai ma trận thì trả MÃ dịch được, không phải câu mặc định của yup', async () => {
    // Hộp số của ô tô gắn cho xe máy.
    expect(
      await transmissionError({
        vehicleType: 'motorbike',
        fuelType: 'gasoline',
        transmission: 'dct',
      }),
    ).toBe('transmissionIncompatible');

    // Xe điện không có "số tự động" — nó truyền động một cấp.
    expect(
      await transmissionError({
        vehicleType: 'car',
        fuelType: 'electric',
        transmission: 'automatic',
      }),
    ).toBe('transmissionIncompatible');
  });

  /*
   * Ma trận hộp số × nguồn năng lượng của Ô TÔ (06/10/2026). Mỗi dòng là một tổ hợp form có thể
   * gửi; "invalid" nghĩa là form chặn tại chỗ bằng mã dịch được, và backend từ chối bằng
   * `VEHICLE_TRANSMISSION_INCOMPATIBLE`.
   */
  it.each([
    ['gasoline', 'manual', true],
    ['gasoline', 'automatic', true],
    ['gasoline', 'cvt', true],
    ['gasoline', 'dct', true],
    ['gasoline', 'amt', true],
    ['diesel', 'automatic', true],
    ['diesel', 'manual', true],
    ['electric', 'direct_drive', true],
    ['electric', 'automatic', false],
    ['electric', 'manual', false],
    ['electric', 'cvt', false],
    ['electric', 'other', false],
    ['hybrid', 'e_cvt', true],
    ['hybrid', 'automatic', true],
    ['hybrid', 'dct', true],
    ['hybrid', 'cvt', false],
    ['hybrid', 'manual', false],
    ['plug_in_hybrid', 'e_cvt', true],
    ['plug_in_hybrid', 'automatic', true],
    ['plug_in_hybrid', 'direct_drive', false],
    ['gasoline', 'direct_drive', false],
    ['gasoline', 'e_cvt', false],
  ])('ô tô %s + %s → hợp lệ: %s', async (fuelType, transmission, valid) => {
    expect(await transmissionError({ vehicleType: 'car', fuelType, transmission })).toBe(
      valid ? undefined : 'transmissionIncompatible',
    );
  });

  it('bỏ trống vẫn hợp lệ — bắt buộc hay không là việc của checklist lên chợ', async () => {
    expect(
      await transmissionError({ vehicleType: 'car', fuelType: 'gasoline', transmission: null }),
    ).toBeUndefined();
  });
});
