import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { FUEL_TYPE, RENT_REFERENCE_BASIS, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { App } from 'antd';
import { useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VehicleDataSuggestion } from '@/features/vehicle-data/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { CatalogRentHint, CatalogValueHint } from './CatalogSuggestions';
import { VehicleIdentityFields } from './VehicleIdentityFields';

/**
 * Gợi ý từ Dữ liệu xe (ADR 0090): GỢI Ý như Mioto, không tự điền.
 *   - thẻ thông số chỉ chép vào form khi chủ xe bấm "Áp dụng thông số"; tiện ích được CỘNG thêm;
 *   - không thấy phiên bản thì GÕ ngay trong ô (không hộp thoại đề xuất);
 *   - giá thuê: giá tham khảo + nút dùng, giá thực tế của xe cùng dòng; không có gì ⇒ fallback.
 */

const RECORD = {
  id: 'v-hybrid',
  modelId: 'm-sedan',
  label: '2.0 Hybrid',
  yearFrom: 2021,
  yearTo: null,
  seatCount: 5,
  bodyType: null,
  fuelType: FUEL_TYPE.HYBRID,
  transmission: 'e_cvt',
  engineDisplacementCc: 1987,
  horsepowerHp: 150,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  curbWeightKg: null,
  fuelConsumptionCombined: '4.5',
  electricRangeKm: null,
  batteryCapacityKwh: null,
  featureKeys: ['camera_360'],
  reviewStatus: 'approved',
} as VehicleDataSuggestion['record'];

const SUGGESTION: VehicleDataSuggestion = {
  modelId: 'm-sedan',
  record: RECORD,
  value: { amount: '612000000', age: 3, residualPercent: 82 },
  rent: [
    {
      field: 'weekdayPrice',
      reference: '1000000',
      referenceBasis: RENT_REFERENCE_BASIS.RECORD,
      market: { sampleSize: 6, low: '900000', median: '950000', high: '1100000' },
    },
    { field: 'monthlyPrice', reference: null, referenceBasis: null, market: null },
  ] as VehicleDataSuggestion['rent'],
};

vi.mock('@/features/vehicle-data/hooks', () => ({
  useVehicleDataOptions: () => ({ options: [RECORD], isLoading: false }),
  useVehicleDataSuggestion: () => SUGGESTION,
  useCreateOwnerModel: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/features/catalog/use-catalog-models', () => ({
  useCatalogModels: () => ({
    models: [
      {
        id: 'm-sedan',
        key: 'toyota-sedan',
        label: 'Sedan',
        brandKey: 'toyota',
        vehicleType: VEHICLE_TYPE.CAR,
        marketStatus: 'current',
        motorbikeCategory: null,
        fuelTypes: [],
        transmissions: [],
        engineDisplacementCc: null,
        seatCounts: [],
        yearFrom: null,
        yearTo: null,
        active: true,
        reviewStatus: 'approved',
      },
    ],
    isLoading: false,
  }),
  useCatalogModelGroups: () => [],
}));

const handle: { current: UseFormReturn<VehicleFormValues> | null } = { current: null };

function Harness({ initial }: { initial: Partial<VehicleFormValues> }) {
  const methods = useForm<VehicleFormValues>({ defaultValues: initial as VehicleFormValues });
  useEffect(() => {
    handle.current = methods;
  }, [methods]);
  return (
    <App>
      <VehicleIdentityFields
        control={methods.control}
        vehicleType={VEHICLE_TYPE.CAR}
        setValue={methods.setValue}
      />
    </App>
  );
}

const form = () => {
  if (!handle.current) throw new Error('Harness chưa render');
  return handle.current;
};

afterEach(() => {
  cleanup();
  handle.current = null;
});

describe('Gợi ý thông số theo phiên bản', () => {
  it('hiện thẻ gợi ý nhưng KHÔNG tự điền; bấm "Áp dụng" mới chép, tiện ích được cộng thêm', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-sedan',
          vehicleCatalogVariantId: 'v-hybrid',
          manufactureYear: 2022,
          horsepowerHp: null,
          features: ['bluetooth'],
        }}
      />,
    );

    expect(await screen.findByText('Thông số tham khảo · Sedan 2.0 Hybrid')).toBeTruthy();
    expect(form().getValues('horsepowerHp')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng thông số' }));
    await waitFor(() => expect(form().getValues('horsepowerHp')).toBe(150));
    expect(form().getValues('engineDisplacementCc')).toBe(1987);
    expect(form().getValues('fuelType')).toBe(FUEL_TYPE.HYBRID);
    expect(form().getValues('fuelConsumptionCombined')).toBe(4.5);
    expect(form().getValues('features')).toEqual(['bluetooth', 'camera_360']);
  });

  it('gõ một phiên bản chưa có ⇒ lưu tên đã gõ (không hộp thoại), bỏ được', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-sedan',
          vehicleCatalogVariantId: null,
          catalogVariantLabel: null,
        }}
      />,
    );
    const select = await screen.findByLabelText('Phiên bản');
    fireEvent.mouseDown(select);
    fireEvent.change(select, { target: { value: '1.8 Turbo' } });
    fireEvent.click(await screen.findByText('Thêm phiên bản "1.8 Turbo"'));
    await waitFor(() => expect(form().getValues('catalogVariantLabel')).toBe('1.8 Turbo'));
    expect(form().getValues('vehicleCatalogVariantId')).toBeNull();
    expect(screen.getByText('Phiên bản mới: 1.8 Turbo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ' }));
    await waitFor(() => expect(form().getValues('catalogVariantLabel')).toBeNull());
  });

  it('đổi dòng xe ⇒ phiên bản cũ (chọn hay gõ) bị gỡ', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-sedan',
          vehicleCatalogVariantId: 'v-hybrid',
          catalogVariantLabel: null,
        }}
      />,
    );
    await waitFor(() => expect(handle.current).not.toBeNull());
    act(() => form().setValue('catalogVariantLabel', 'X'));
    act(() => form().setValue('vehicleCatalogModelId', 'm-other'));
    await waitFor(() => expect(form().getValues('vehicleCatalogVariantId')).toBeNull());
    expect(form().getValues('catalogVariantLabel')).toBeNull();
  });
});

describe('Gợi ý giá thuê + giá trị xe', () => {
  it('giá tham khảo kèm nút dùng + giá thực tế của xe cùng dòng', () => {
    const onApply = vi.fn();
    renderWithIntl(
      <CatalogRentHint
        suggestion={SUGGESTION}
        field="weekdayPrice"
        onApply={onApply}
        fallback={<span>gợi ý cũ</span>}
      />,
    );
    expect(screen.getByText(/Giá tham khảo XePrime/)).toBeTruthy();
    expect(screen.getByText(/Xe cùng dòng đang cho thuê/)).toBeTruthy();
    expect(screen.queryByText('gợi ý cũ')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Dùng/ }));
    expect(onApply).toHaveBeenCalledWith(1000000);
  });

  it('không có gì cho ô giá đó ⇒ rơi về gợi ý cũ', () => {
    renderWithIntl(
      <CatalogRentHint
        suggestion={SUGGESTION}
        field="monthlyPrice"
        fallback={<span>gợi ý cũ</span>}
      />,
    );
    expect(screen.getByText('gợi ý cũ')).toBeTruthy();
  });

  it('giá trị xe nói rõ tuổi xe + % còn lại, bấm dùng điền số', () => {
    const onApply = vi.fn();
    renderWithIntl(<CatalogValueHint value={SUGGESTION.value!} onApply={onApply} />);
    expect(screen.getByText(/xe 3 năm tuổi, còn 82% giá xe mới/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dùng giá trị này' }));
    expect(onApply).toHaveBeenCalledWith(612000000);
  });
});
