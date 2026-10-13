import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SEARCH_QUERY_MAX_LENGTH } from '@xeprime/domain';
import viMarketplace from '@xeprime/domain/messages/vi/marketplace.json';
import { withIntl } from '@/i18n/test-utils';
import { marketplaceApi } from '../api';
import {
  KEYWORD_APPLY_DELAY_MS,
  KeywordSearch,
  toAppliedKeyword,
} from './KeywordSearch';

const k = viMarketplace.results.keyword;

async function renderSearch(value?: string) {
  const onApply = jest.fn();
  const onOpenShop = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = await render(
    withIntl(
      <QueryClientProvider client={client}>
        <KeywordSearch value={value} onApply={onApply} onOpenShop={onOpenShop} />
      </QueryClientProvider>,
    ),
  );
  return { onApply, onOpenShop, view };
}

describe('toAppliedKeyword', () => {
  it('cắt khoảng trắng, cắt trần độ dài, rỗng ⇒ bỏ', () => {
    expect(toAppliedKeyword('  vf8 ')).toBe('vf8');
    expect(toAppliedKeyword('   ')).toBeUndefined();
    expect(toAppliedKeyword('a'.repeat(SEARCH_QUERY_MAX_LENGTH + 5))).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    );
  });
});

describe('KeywordSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest
      .spyOn(marketplaceApi, 'shopSuggestions')
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 5, total: 0, hasNext: false } });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('gõ ⇒ áp sau nhịp trì hoãn, một lần', async () => {
    const { onApply, view } = await renderSearch();
    await fireEvent.changeText(view.getByPlaceholderText(k.placeholder), 'vinfast');
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(KEYWORD_APPLY_DELAY_MS);
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('vinfast');
  });

  it('phím "Tìm" áp ngay; xoá hết ⇒ bỏ từ khoá ngay', async () => {
    const { onApply, view } = await renderSearch('mazda');
    const input = view.getByPlaceholderText(k.placeholder);
    await fireEvent.changeText(input, 'vios');
    await fireEvent(input, 'submitEditing');
    expect(onApply).toHaveBeenLastCalledWith('vios');
    await fireEvent.changeText(input, '');
    expect(onApply).toHaveBeenLastCalledWith(undefined);
  });

  it('gợi ý chủ xe khi đang focus — chạm là MỞ gian hàng, không áp thành từ khoá', async () => {
    jest.useRealTimers();
    jest.spyOn(marketplaceApi, 'shopSuggestions').mockResolvedValue({
      items: [
        {
          slug: 'nguyen-auto',
          name: 'Nguyễn Auto',
          verified: true,
          vehicleCount: 3,
          provinceName: 'TP. Hồ Chí Minh',
          logoUrl: null,
        } as never,
      ],
      meta: { page: 1, limit: 5, total: 1, hasNext: false },
    });
    const { onApply, onOpenShop, view } = await renderSearch();
    const input = view.getByPlaceholderText(k.placeholder);
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'nguyen');
    const row = await view.findByLabelText('Nguyễn Auto');
    await fireEvent.press(row);
    expect(onOpenShop).toHaveBeenCalledWith('nguyen-auto');
    expect(onApply).not.toHaveBeenCalledWith('Nguyễn Auto');
  });
});
