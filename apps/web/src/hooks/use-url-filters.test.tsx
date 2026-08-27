import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { positiveIntParam, useUrlFilters } from './use-url-filters';

/**
 * Hợp đồng URL của mọi danh sách quản lý. Đây là nơi duy nhất luật được viết ra, nên cũng là nơi
 * duy nhất nó được khoá bằng test — 9 hook sẽ dời sang đây ở các đợt sau.
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/manage/receipts',
  useSearchParams: () => nav.params,
}));

interface Filters {
  q?: string;
  status?: string;
  view?: string;
  page?: number;
  limit?: number;
}

function parse(sp: URLSearchParams): Filters {
  return {
    q: sp.get('q') ?? undefined,
    status: sp.get('status') ?? undefined,
    view: sp.get('view') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  };
}

type Api = ReturnType<typeof useUrlFilters<Filters>>;

function mount(): { current: Api } {
  const ref = { current: undefined as unknown as Api };
  function Probe() {
    ref.current = useUrlFilters<Filters>(parse);
    return null;
  }
  render(<Probe />);
  return ref;
}

/** URL cuối cùng đã ghi. Luôn kèm khẳng định khẳng định để không đúng-một-cách-vô-nghĩa. */
function lastUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
});

afterEach(cleanup);

describe('useUrlFilters — đọc từ URL', () => {
  it('parse chạy trên searchParams hiện tại', () => {
    nav.params = new URLSearchParams('q=abc&status=draft&page=3&limit=50');
    const api = mount();

    expect(api.current.filters).toEqual({
      q: 'abc',
      status: 'draft',
      view: undefined,
      page: 3,
      limit: 50,
    });
  });

  it('positiveIntParam loại giá trị rác và số không dương', () => {
    const sp = new URLSearchParams('a=abc&b=0&c=-2&d=4&e=');
    expect(positiveIntParam(sp, 'a')).toBeUndefined();
    expect(positiveIntParam(sp, 'b')).toBeUndefined();
    expect(positiveIntParam(sp, 'c')).toBeUndefined();
    expect(positiveIntParam(sp, 'd')).toBe(4);
    expect(positiveIntParam(sp, 'e')).toBeUndefined();
  });
});

describe('useUrlFilters — ghi lên URL', () => {
  it('ghi bằng replace + scroll:false để không tạo mục lịch sử và không nhảy trang', () => {
    const api = mount();
    act(() => api.current.setFilters({ status: 'draft' }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace.mock.calls[0]![1]).toEqual({ scroll: false });
  });

  it('giữ nguyên tên tham số công khai', () => {
    const api = mount();
    act(() => api.current.setFilters({ q: 'honda', status: 'approved' }));

    const params = paramsOf(lastUrl());
    expect(params.get('q')).toBe('honda');
    expect(params.get('status')).toBe('approved');
  });

  it('link lọc chia sẻ được: mọi filter nằm hết trong query string', () => {
    const api = mount();
    act(() => api.current.setFilters({ q: 'honda', status: 'draft' }));

    expect(lastUrl().startsWith('/manage/receipts?')).toBe(true);
  });

  it('xoá hết filter thì về đường dẫn trần, không để lại dấu "?"', () => {
    nav.params = new URLSearchParams('q=honda');
    const api = mount();
    act(() => api.current.setFilters({ q: undefined }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toBe('/manage/receipts');
  });
});

describe('useUrlFilters — xoá tham số rỗng/mặc định', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['chuỗi rỗng', ''],
    ['giá trị "all"', 'all'],
    ['false', false],
  ])('%s → xoá hẳn tham số', (_label, value) => {
    nav.params = new URLSearchParams('status=draft');
    const api = mount();
    act(() => api.current.setFilters({ status: value as never }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(paramsOf(lastUrl()).has('status')).toBe(false);
  });

  it('giá trị 0 KHÔNG bị coi là rỗng', () => {
    const api = mount();
    act(() => api.current.setFilters({ page: 0 as never }));

    expect(paramsOf(lastUrl()).get('page')).toBe('0');
  });
});

describe('useUrlFilters — phân trang', () => {
  it('đổi filter đưa về trang 1 (xoá page)', () => {
    nav.params = new URLSearchParams('status=draft&page=7');
    const api = mount();
    act(() => api.current.setFilters({ status: 'approved' }));

    expect(paramsOf(lastUrl()).get('status')).toBe('approved');
    expect(paramsOf(lastUrl()).has('page')).toBe(false);
  });

  it('tự set page thì giữ nguyên — đó chính là hành động phân trang', () => {
    const api = mount();
    act(() => api.current.setFilters({ page: 4, limit: 20 }));

    const params = paramsOf(lastUrl());
    expect(params.get('page')).toBe('4');
    expect(params.get('limit')).toBe('20');
  });

  it('resetPage:false giữ trang cho tham số chỉ đổi giao diện', () => {
    nav.params = new URLSearchParams('status=draft&page=7');
    const api = mount();
    act(() => api.current.setFilters({ view: 'grid' }, { resetPage: false }));

    const params = paramsOf(lastUrl());
    expect(params.get('view')).toBe('grid');
    expect(params.get('page')).toBe('7');
  });

  it('resetPage:true là mặc định, nêu tường minh cũng cho kết quả như vậy', () => {
    nav.params = new URLSearchParams('page=7');
    const api = mount();
    act(() => api.current.setFilters({ status: 'draft' }, { resetPage: true }));

    expect(paramsOf(lastUrl()).has('page')).toBe(false);
  });

  it('page trong patch thắng resetPage:true', () => {
    const api = mount();
    act(() => api.current.setFilters({ page: 2 }, { resetPage: true }));

    expect(paramsOf(lastUrl()).get('page')).toBe('2');
  });
});

describe('useUrlFilters — giữ tham số không liên quan', () => {
  it('tham số ngoài phạm vi filter sống sót qua mỗi lần ghi', () => {
    nav.params = new URLSearchParams('utm_source=zalo&ref=abc&status=draft');
    const api = mount();
    act(() => api.current.setFilters({ status: 'approved' }));

    const params = paramsOf(lastUrl());
    expect(params.get('utm_source')).toBe('zalo');
    expect(params.get('ref')).toBe('abc');
  });

  it('xoá một filter không đụng tham số khác', () => {
    nav.params = new URLSearchParams('ref=abc&q=honda');
    const api = mount();
    act(() => api.current.setFilters({ q: undefined }));

    const params = paramsOf(lastUrl());
    expect(params.get('ref')).toBe('abc');
    expect(params.has('q')).toBe(false);
  });
});

describe('useUrlFilters — back/forward', () => {
  it('filters bám theo searchParams: URL đổi (do back) thì filters đổi theo, không giữ state riêng', () => {
    nav.params = new URLSearchParams('status=draft');
    const api = mount();
    expect(api.current.filters.status).toBe('draft');

    // Mô phỏng nút Back: Next cấp searchParams mới, component render lại.
    cleanup();
    nav.params = new URLSearchParams('status=approved');
    const after = mount();

    expect(after.current.filters.status).toBe('approved');
    // Không có lần ghi URL nào — điều hướng lịch sử không được kích hoạt ghi ngược.
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
