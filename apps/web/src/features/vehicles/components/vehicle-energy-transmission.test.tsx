import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { FUEL_TYPE, TRANSMISSION_TYPE_EXT, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';

import { VehicleEnergyFields } from './VehicleEnergyFields';
import { useTransmissionOptions } from './VehicleFormSections';

/**
 * Ô "Hộp số" đi theo "Nguồn năng lượng" (06/10/2026).
 *
 * Lỗi đã xảy ra: chọn Điện mà ô hộp số vẫn giữ "Số tự động" từ trước — form hiện một lựa chọn
 * không có trong danh sách rồi tự chặn lúc lưu bằng "Kiểu truyền động không phù hợp…". Bộ này
 * khoá ba chuyển đổi của đặc tả: Xăng → Điện, Điện → Xăng, Xăng → Hybrid.
 *
 * Ô nguồn năng lượng đọc danh mục qua TanStack Query; nó không phải thứ đang kiểm nên được thay
 * bằng một ô rỗng — test đổi nguồn năng lượng thẳng bằng `setValue`, đúng như người dùng chọn.
 */
vi.mock('./VehicleFormSections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./VehicleFormSections')>();
  return { ...actual, FuelTypeSelect: () => null };
});
// Ô nguồn năng lượng còn đọc MẪU XE đang chọn (điền sẵn/khoá theo danh mục) qua cùng TanStack
// Query — thay bằng danh mục mẫu cố định như các test form xe khác.
vi.mock('@/features/catalog/use-catalog-models', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModelsModuleMock(),
);

/** Tay cầm của form để test đọc/ghi giá trị — gán trong effect, không gán lúc render. */
const handle: { current: UseFormReturn<VehicleFormValues> | null } = { current: null };

function Harness({ initial }: { initial: Partial<VehicleFormValues> }) {
  const methods = useForm<VehicleFormValues>({ defaultValues: initial as VehicleFormValues });
  const fuelType = useWatch({ control: methods.control, name: 'fuelType' });
  const options = useTransmissionOptions(VEHICLE_TYPE.CAR, fuelType);
  useEffect(() => {
    handle.current = methods;
  }, [methods]);
  return (
    <VehicleEnergyFields
      control={methods.control}
      vehicleType={VEHICLE_TYPE.CAR}
      transmissionOptions={options}
      setValue={methods.setValue}
    />
  );
}

const form = () => {
  if (!handle.current) throw new Error('Harness chưa render');
  return handle.current;
};
const transmission = () => form().getValues('transmission');
const select = () => document.querySelector('.ant-select') as HTMLElement;

describe('VehicleEnergyFields — hộp số theo nguồn năng lượng', () => {
  it('Xăng (AT) → Điện: tự thành 1 cấp (EV), ô khoá, có câu giải thích', async () => {
    render(
      <Harness
        initial={{ fuelType: FUEL_TYPE.GASOLINE, transmission: TRANSMISSION_TYPE_EXT.AUTOMATIC }}
      />,
    );
    expect(transmission()).toBe(TRANSMISSION_TYPE_EXT.AUTOMATIC);

    act(() => form().setValue('fuelType', FUEL_TYPE.ELECTRIC));

    await waitFor(() => expect(transmission()).toBe(TRANSMISSION_TYPE_EXT.DIRECT_DRIVE));
    expect(select().classList.contains('ant-select-disabled')).toBe(true);
    expect(screen.getByText('1 cấp (EV)')).toBeTruthy();
    expect(screen.getByText('Xe điện sử dụng hệ truyền động 1 cấp.')).toBeTruthy();
  });

  it('mở một xe điện cũ đã lưu "số tự động": sửa ngay thành 1 cấp, không chặn lúc lưu', async () => {
    render(
      <Harness
        initial={{ fuelType: FUEL_TYPE.ELECTRIC, transmission: TRANSMISSION_TYPE_EXT.AUTOMATIC }}
      />,
    );
    await waitFor(() => expect(transmission()).toBe(TRANSMISSION_TYPE_EXT.DIRECT_DRIVE));
  });

  it('Điện → Xăng: 1 cấp không còn hợp lệ, về trống và mở khoá', async () => {
    render(<Harness initial={{ fuelType: FUEL_TYPE.ELECTRIC, transmission: null }} />);
    await waitFor(() => expect(transmission()).toBe(TRANSMISSION_TYPE_EXT.DIRECT_DRIVE));

    act(() => form().setValue('fuelType', FUEL_TYPE.GASOLINE));

    await waitFor(() => expect(transmission()).toBeNull());
    expect(select().classList.contains('ant-select-disabled')).toBe(false);
  });

  it('Xăng (CVT) → Hybrid: CVT thường không có ở hybrid nên về trống', async () => {
    render(
      <Harness initial={{ fuelType: FUEL_TYPE.GASOLINE, transmission: TRANSMISSION_TYPE_EXT.CVT }} />,
    );
    act(() => form().setValue('fuelType', FUEL_TYPE.HYBRID));
    await waitFor(() => expect(transmission()).toBeNull());
  });

  it('Xăng (AT) → Hybrid: AT vẫn hợp lệ nên GIỮ nguyên', async () => {
    render(
      <Harness
        initial={{ fuelType: FUEL_TYPE.GASOLINE, transmission: TRANSMISSION_TYPE_EXT.AUTOMATIC }}
      />,
    );
    act(() => form().setValue('fuelType', FUEL_TYPE.PLUG_IN_HYBRID));
    await waitFor(() => expect(form().getValues('fuelType')).toBe(FUEL_TYPE.PLUG_IN_HYBRID));
    expect(transmission()).toBe(TRANSMISSION_TYPE_EXT.AUTOMATIC);
  });
});
