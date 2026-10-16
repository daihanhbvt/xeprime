import { fireEvent, render } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { FilterSheet } from './FilterSheet';

/**
 * Bộ lọc "Hỗ trợ xuất hoá đơn VAT" (PR #190) phải hiện trong tấm lọc như web — bản trước lọc bỏ
 * nó dù bản nháp, bản vá và facet đều đã có `vatInvoice`.
 */
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/features/catalog/use-catalog', () => ({
  // Mọi loại danh mục đều rỗng — tấm lọc chỉ cần mảng để map.
  useCatalog: () => ({ catalog: new Proxy({}, { get: () => [] }) }),
  useCatalogLabels: () => ({ brandLabel: (key: string) => key }),
}));

jest.mock('../hooks/use-search-results', () => ({
  useListingFacets: () => ({
    data: {
      total: 4,
      bodyType: [],
      seats: [],
      fuelType: [],
      features: [],
      brand: [],
      price: { min: '0', max: '0' },
      amenities: { hourly: 1, delivery: 1, noCollateral: 1, discount: 1, vatInvoice: 2 },
    },
  }),
}));

describe('FilterSheet', () => {
  it('hiện dòng hoá đơn VAT và áp `vatInvoice: true` khi bật', async () => {
    const onApply = jest.fn();
    const view = await render(
      withIntl(<FilterSheet open filters={{}} onApply={onApply} onClose={jest.fn()} />),
    );

    const row = view.getByText('Hỗ trợ xuất hoá đơn VAT (2)');
    await fireEvent.press(row);
    await fireEvent.press(view.getByText('Áp dụng (4 xe)'));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ vatInvoice: true }));
  });
});
