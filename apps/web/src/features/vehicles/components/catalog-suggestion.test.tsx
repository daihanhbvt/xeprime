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
 * Ô "Mẫu xe" gộp + Dữ liệu xe (ADR 0090 · ADR 0102):
 *   - chọn một phiên bản ⇒ điền NGAY thông số (tiện ích được CỘNG thêm), không có bước "Áp dụng";
 *   - dòng chưa có phiên bản nào chọn theo dòng; mục "Nhập tay" mở cặp ô Dòng xe → Phiên bản, gõ
 *     được phiên bản mới; quay lại danh sách thì bỏ tên đã gõ;
 *   - năm sản xuất ngoài đời của phiên bản ⇒ cảnh báo dưới ô;
 *   - giá thuê / giá trị xe: vẫn là GỢI Ý + nút dùng; không có gì ⇒ fallback.
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
  useBrandVehicleDataOptions: () => ({ options: [RECORD], isLoading: false, isError: false }),
  useVehicleDataSuggestion: () => SUGGESTION,
  useCreateOwnerModel: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
function catalogModel(id: string, label: string) {
  return {
    id,
    key: `toyota-${id}`,
    label,
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
  };
}
// `m-wagon` chưa có xe chuẩn nào ⇒ ô gộp hiện riêng tên dòng.
const MODELS = [catalogModel('m-sedan', 'Sedan'), catalogModel('m-wagon', 'Wagon')];

vi.mock('@/features/catalog/use-catalog-models', () => ({
  useCatalogModels: () => ({ models: MODELS, isLoading: false }),
  useCatalogModelGroups: (models: typeof MODELS) => [
    { marketStatus: 'current', options: models.map((m) => ({ value: m.id, label: m.label })) },
  ],
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

/** Mở ô chọn theo nhãn rồi bấm một dòng — AntD Select trong jsdom. */
async function pick(label: string, option: string) {
  fireEvent.mouseDown(await screen.findByLabelText(label));
  fireEvent.click(await screen.findByText(option));
}

describe('Ô "Mẫu xe" gộp dòng xe + phiên bản', () => {
  it('chọn một phiên bản ⇒ gắn dòng + phiên bản và điền ngay thông số, tiện ích cộng thêm', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: null,
          vehicleCatalogVariantId: null,
          horsepowerHp: null,
          features: ['bluetooth'],
        }}
      />,
    );

    // Nhãn gọn như hãng gọi xe - chỉ một đời nên không kèm đời.
    await pick('Mẫu xe', 'Sedan 2.0 Hybrid');

    await waitFor(() => expect(form().getValues('vehicleCatalogVariantId')).toBe('v-hybrid'));
    expect(form().getValues('vehicleCatalogModelId')).toBe('m-sedan');
    expect(form().getValues('horsepowerHp')).toBe(150);
    expect(form().getValues('engineDisplacementCc')).toBe(1987);
    expect(form().getValues('fuelType')).toBe(FUEL_TYPE.HYBRID);
    expect(form().getValues('fuelConsumptionCombined')).toBe(4.5);
    expect(form().getValues('features')).toEqual(['bluetooth', 'camera_360']);
  });

  it('dòng chưa có phiên bản ⇒ chọn theo dòng, không gắn phiên bản', async () => {
    renderWithIntl(<Harness initial={{ brand: 'toyota', vehicleCatalogModelId: null }} />);
    await pick('Mẫu xe', 'Wagon');
    await waitFor(() => expect(form().getValues('vehicleCatalogModelId')).toBe('m-wagon'));
    expect(form().getValues('vehicleCatalogVariantId')).toBeNull();
  });

  it('đổi sang dòng khác ⇒ gỡ thông số phiên bản cũ đã tự điền, giữ ô chủ xe đã sửa', async () => {
    renderWithIntl(
      <Harness
        initial={{ brand: 'toyota', vehicleCatalogModelId: null, vehicleCatalogVariantId: null }}
      />,
    );
    await pick('Mẫu xe', 'Sedan 2.0 Hybrid');
    await waitFor(() => expect(form().getValues('horsepowerHp')).toBe(150));
    // Chủ xe tự sửa dung tích ⇒ đó là dữ liệu của họ, không còn là của xe chuẩn.
    act(() => form().setValue('engineDisplacementCc', 2000));

    await pick('Mẫu xe', 'Wagon');
    await waitFor(() => expect(form().getValues('vehicleCatalogModelId')).toBe('m-wagon'));
    expect(form().getValues('horsepowerHp')).toBeNull();
    expect(form().getValues('fuelConsumptionCombined')).toBeNull();
    expect(form().getValues('engineDisplacementCc')).toBe(2000);
  });

  it('"Nhập tay" ⇒ gõ phiên bản mới (không hộp thoại); quay lại danh sách thì bỏ tên đã gõ', async () => {
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
    await pick('Mẫu xe', 'Nhập tay - xe chưa có trong danh sách');

    const select = await screen.findByLabelText('Phiên bản');
    fireEvent.mouseDown(select);
    fireEvent.change(select, { target: { value: '1.8 Turbo' } });
    fireEvent.click(await screen.findByText('Thêm phiên bản "1.8 Turbo"'));
    await waitFor(() => expect(form().getValues('catalogVariantLabel')).toBe('1.8 Turbo'));
    expect(form().getValues('vehicleCatalogVariantId')).toBeNull();
    expect(screen.getByText('Phiên bản mới: 1.8 Turbo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn từ danh sách mẫu xe' }));
    await waitFor(() => expect(form().getValues('catalogVariantLabel')).toBeNull());
    expect(await screen.findByLabelText('Mẫu xe')).toBeTruthy();
  });

  it('xe đang mang phiên bản gõ tay ⇒ mở sẵn chế độ nhập tay; đổi dòng xe ⇒ bỏ phiên bản cũ', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-sedan',
          vehicleCatalogVariantId: null,
          catalogVariantLabel: '1.8 Turbo',
        }}
      />,
    );
    expect(await screen.findByText('Phiên bản mới: 1.8 Turbo')).toBeTruthy();
    expect(screen.queryByLabelText('Mẫu xe')).toBeNull();

    await pick('Dòng xe (Model)', 'Wagon');
    await waitFor(() => expect(form().getValues('vehicleCatalogModelId')).toBe('m-wagon'));
    expect(form().getValues('catalogVariantLabel')).toBeNull();
  });

  it('năm sản xuất ngoài đời của phiên bản ⇒ cảnh báo dưới ô', async () => {
    renderWithIntl(
      <Harness
        initial={{
          brand: 'toyota',
          vehicleCatalogModelId: 'm-sedan',
          vehicleCatalogVariantId: 'v-hybrid',
          manufactureYear: 2019,
        }}
      />,
    );
    expect(await screen.findByText(/Năm sản xuất 2019 nằm ngoài đời 2021 - nay/)).toBeTruthy();
    act(() => form().setValue('manufactureYear', 2022));
    await waitFor(() => expect(screen.queryByText(/nằm ngoài đời/)).toBeNull());
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
