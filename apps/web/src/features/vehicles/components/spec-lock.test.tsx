import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { FUEL_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import { useTransmissionOptions } from './VehicleFormSections';
import { VehicleClassificationFields } from './VehicleClassificationFields';
import { VehicleEnergyFields } from './VehicleEnergyFields';

/**
 * Ô thông số khoá theo xe chuẩn đang chọn (ADR 0102):
 *   - giá trị KHỚP xe chuẩn ⇒ ô chỉ đọc, bút trong ô; bấm bút ⇒ mở riêng ô đó;
 *   - giá trị LỆCH xe chuẩn (xe cũ lưu khác) ⇒ không khoá;
 *   - chưa chọn phiên bản ⇒ không khoá gì.
 */

const RECORD = {
  id: 'v-vios',
  modelId: 'm-vios',
  label: '1.5G CVT',
  yearFrom: 2018,
  yearTo: 2022,
  seatCount: 5,
  bodyType: 'sedan',
  fuelType: FUEL_TYPE.GASOLINE,
  transmission: 'cvt',
  engineDisplacementCc: 1496,
  horsepowerHp: 107,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  curbWeightKg: null,
  fuelConsumptionCombined: null,
  electricRangeKm: null,
  batteryCapacityKwh: null,
  featureKeys: [],
  reviewStatus: 'approved',
};

vi.mock('@/features/vehicle-data/hooks', async () => ({
  ...(await import('@/features/vehicle-data/test-vehicle-data')).vehicleDataHooksMock(),
  useBrandVehicleDataOptions: () => ({ options: [RECORD], isLoading: false, isError: false }),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/features/catalog/use-catalog-models', () => ({
  useCatalogModels: () => ({ models: [], isLoading: false }),
  useCatalogModelGroups: () => [],
}));

const handle: { current: UseFormReturn<VehicleFormValues> | null } = { current: null };

function Harness({ initial }: { initial: Partial<VehicleFormValues> }) {
  const methods = useForm<VehicleFormValues>({
    defaultValues: { vehicleType: VEHICLE_TYPE.CAR, ...initial } as VehicleFormValues,
  });
  const transmissionOptions = useTransmissionOptions(VEHICLE_TYPE.CAR, FUEL_TYPE.GASOLINE);
  useEffect(() => {
    handle.current = methods;
  }, [methods]);
  return (
    <>
      <VehicleClassificationFields
        control={methods.control}
        vehicleType={VEHICLE_TYPE.CAR}
        setValue={methods.setValue}
      />
      <VehicleEnergyFields
        control={methods.control}
        vehicleType={VEHICLE_TYPE.CAR}
        transmissionOptions={transmissionOptions}
        setValue={methods.setValue}
      />
    </>
  );
}

const seatInput = () => screen.getByLabelText('Số chỗ ngồi') as HTMLInputElement;
const engineInput = () => screen.getByLabelText('Dung tích động cơ (cc)') as HTMLInputElement;

afterEach(() => {
  cleanup();
  handle.current = null;
});

describe('Khoá ô thông số theo mẫu xe', () => {
  it('khớp xe chuẩn ⇒ khoá kèm bút; bấm bút chỉ mở đúng ô đó', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-vios',
          vehicleCatalogVariantId: 'v-vios',
          seatCount: 5,
          fuelType: FUEL_TYPE.GASOLINE,
          engineDisplacementCc: 1496,
        }}
      />,
    );

    // Khoá = ô chỉ đọc (cùng kiểu ô cà vẹt), giá trị đã định dạng, bút trong ô.
    await waitFor(() => expect(seatInput().readOnly).toBe(true));
    // Khoá là trạng thái của CHÍNH ô số (field-lock) nên giá trị là số thô.
    expect(seatInput().value).toBe('5');
    expect(engineInput().readOnly).toBe(true);
    expect(screen.getAllByText('Theo dữ liệu mẫu xe').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Số chỗ ngồi' }));
    await waitFor(() => expect(seatInput().readOnly).toBe(false));
    expect(seatInput().disabled).toBe(false);
    expect(engineInput().readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Sửa Số chỗ ngồi' })).toBeNull();
  });

  it('giá trị lệch xe chuẩn ⇒ không khoá', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-vios',
          vehicleCatalogVariantId: 'v-vios',
          seatCount: 7,
          fuelType: FUEL_TYPE.GASOLINE,
          engineDisplacementCc: 1800,
        }}
      />,
    );
    await waitFor(() => expect(handle.current).not.toBeNull());
    expect(seatInput().readOnly).toBe(false);
    expect(engineInput().readOnly).toBe(false);
  });

  it('chưa chọn phiên bản ⇒ không khoá gì', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-vios',
          vehicleCatalogVariantId: null,
          seatCount: 5,
          engineDisplacementCc: 1496,
        }}
      />,
    );
    await waitFor(() => expect(handle.current).not.toBeNull());
    expect(seatInput().readOnly).toBe(false);
    expect(screen.queryByRole('button', { name: /^Sửa / })).toBeNull();
  });
});
