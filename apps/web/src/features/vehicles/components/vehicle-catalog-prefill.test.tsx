import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { FUEL_TYPE, TRANSMISSION_TYPE_EXT, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import { VehicleClassificationFields } from './VehicleClassificationFields';
import { VehicleIdentityFields } from './VehicleIdentityFields';

/**
 * Chọn MẪU XE ⇒ form điền sẵn theo danh mục (`catalogSpecRule`):
 *   - một cấu hình (VF 5: 5 chỗ, Điện) ⇒ điền và KHOÁ ô số chỗ;
 *   - nhiều cấu hình (VF 9: 6/7 chỗ) ⇒ bỏ giá trị không thuộc mẫu, chỉ cho chọn trong đó;
 *   - mở form SỬA một xe đã lưu ⇒ không ghi đè gì cả.
 */

function model(
  id: string,
  label: string,
  seatCounts: number[],
  fuelTypes: string[],
  transmissions: string[] = [],
) {
  return {
    id,
    key: `vinfast-${id}`,
    label,
    brandKey: 'vinfast',
    vehicleType: VEHICLE_TYPE.CAR,
    marketStatus: 'current',
    motorbikeCategory: null,
    fuelTypes,
    transmissions,
    engineDisplacementCc: null,
    seatCounts,
    yearFrom: null,
    yearTo: null,
    active: true,
  };
}

const MODELS = [
  model('vf5', 'VF 5', [5], [FUEL_TYPE.ELECTRIC]),
  model('vf9', 'VF 9', [6, 7], [FUEL_TYPE.ELECTRIC]),
  // Hộp số trong danh mục là HỢP mọi bản; bản hybrid chỉ còn e-CVT.
  model('hev', 'Corolla Cross HEV', [5], [FUEL_TYPE.HYBRID], [
    TRANSMISSION_TYPE_EXT.CVT,
    TRANSMISSION_TYPE_EXT.E_CVT,
  ]),
];

vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/features/catalog/use-catalog-models', () => ({
  useCatalogModels: () => ({ models: MODELS, isLoading: false }),
  useCatalogModelGroups: () => [],
}));

const handle: { current: UseFormReturn<VehicleFormValues> | null } = { current: null };

function Harness({ initial }: { initial: Partial<VehicleFormValues> }) {
  const methods = useForm<VehicleFormValues>({ defaultValues: initial as VehicleFormValues });
  useEffect(() => {
    handle.current = methods;
  }, [methods]);
  return (
    <>
      <VehicleIdentityFields
        control={methods.control}
        vehicleType={VEHICLE_TYPE.CAR}
        setValue={methods.setValue}
      />
      <VehicleClassificationFields
        control={methods.control}
        vehicleType={VEHICLE_TYPE.CAR}
        setValue={methods.setValue}
      />
    </>
  );
}

const form = () => {
  if (!handle.current) throw new Error('Harness chưa render');
  return handle.current;
};
const seatInput = () => screen.getByRole('spinbutton') as HTMLInputElement;

afterEach(() => {
  cleanup();
  handle.current = null;
});

describe('Điền sẵn thông số theo mẫu xe', () => {
  it('mẫu một cấu hình ⇒ điền số chỗ + nguồn năng lượng và khoá ô số chỗ', async () => {
    renderWithIntl(<Harness initial={{ brand: 'vinfast', vehicleCatalogModelId: null }} />);
    act(() => form().setValue('vehicleCatalogModelId', 'vf5'));

    await waitFor(() => expect(form().getValues('seatCount')).toBe(5));
    expect(form().getValues('fuelType')).toBe(FUEL_TYPE.ELECTRIC);
    await waitFor(() => expect(seatInput().disabled).toBe(true));
    expect(screen.getByText('Theo mẫu VF 5 — đã điền sẵn.')).toBeTruthy();
  });

  it('mẫu nhiều cấu hình ⇒ bỏ số chỗ không thuộc mẫu và chỉ cho chọn 6 hoặc 7', async () => {
    renderWithIntl(<Harness initial={{ brand: 'vinfast', vehicleCatalogModelId: null }} />);
    act(() => form().setValue('vehicleCatalogModelId', 'vf5'));
    await waitFor(() => expect(form().getValues('seatCount')).toBe(5));

    act(() => form().setValue('vehicleCatalogModelId', 'vf9'));
    await waitFor(() => expect(form().getValues('seatCount')).toBeNull());
    expect(screen.getByRole('radio', { name: '6 chỗ' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '7 chỗ' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('mở form sửa một xe đã gắn mẫu ⇒ không ghi đè dữ liệu đã lưu', async () => {
    renderWithIntl(
      <Harness initial={{ brand: 'vinfast', vehicleCatalogModelId: 'vf5', seatCount: 4 }} />,
    );
    // Lệch mẫu (VF 5 ghi 4 chỗ): giữ nguyên và KHÔNG khoá, để chủ xe tự sửa lại được.
    await waitFor(() => expect(handle.current).not.toBeNull());
    expect(form().getValues('seatCount')).toBe(4);
    expect(seatInput().disabled).toBe(false);
  });
});

describe('Điền sẵn — hộp số và giá trị lệch mẫu', () => {
  it('hộp số lấy phần của mẫu ỨNG VỚI nguồn năng lượng (hybrid ⇒ e-CVT, không phải CVT)', async () => {
    renderWithIntl(<Harness initial={{ brand: 'vinfast', vehicleCatalogModelId: null }} />);
    act(() => form().setValue('vehicleCatalogModelId', 'hev'));
    await waitFor(() => expect(form().getValues('fuelType')).toBe(FUEL_TYPE.HYBRID));
    expect(form().getValues('transmission')).toBe(TRANSMISSION_TYPE_EXT.E_CVT);
  });

  it('số chỗ đã lưu nằm ngoài các bản của mẫu vẫn hiện thành nút đã chọn', () => {
    renderWithIntl(
      <Harness initial={{ brand: 'vinfast', vehicleCatalogModelId: 'vf9', seatCount: 4 }} />,
    );
    const saved = screen.getByRole('radio', { name: '4 chỗ' }) as HTMLInputElement;
    expect(saved.checked).toBe(true);
    expect(screen.getByRole('radio', { name: '6 chỗ' })).toBeTruthy();
  });
});
