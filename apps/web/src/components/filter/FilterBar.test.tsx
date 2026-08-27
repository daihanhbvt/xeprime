import { Button } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FilterBar, countActiveFilters, type FilterField } from './FilterBar';

const viewport = vi.hoisted(() => ({ mobile: false }));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => viewport.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !viewport.mobile,
  useMediaQuery: () => viewport.mobile,
}));

const FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm phiếu' },
  {
    kind: 'select',
    key: 'status',
    label: 'Trạng thái',
    options: [
      { value: 'draft', label: 'Nháp' },
      { value: 'approved', label: 'Đã duyệt' },
    ],
  },
  { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Khoảng ngày' },
];

function renderBar(props: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(<FilterBar fields={FIELDS} values={{}} onChange={onChange} {...props} />);
  return { ...utils, onChange };
}

beforeEach(() => {
  viewport.mobile = false;
});

afterEach(cleanup);

/* ------------------------------------------------------------------ đếm filter đang bật */

describe('countActiveFilters', () => {
  it('không có gì bật → 0', () => {
    expect(countActiveFilters(FIELDS, {})).toBe(0);
  });

  it('mỗi field bật tính một', () => {
    expect(countActiveFilters(FIELDS, { q: 'abc', status: 'draft' })).toBe(2);
  });

  it('khoảng ngày tính MỘT dù chiếm hai tham số', () => {
    expect(countActiveFilters(FIELDS, { from: '2026-01-01', to: '2026-01-31' })).toBe(1);
  });

  it('chỉ một đầu của khoảng ngày cũng tính là bật', () => {
    expect(countActiveFilters(FIELDS, { from: '2026-01-01' })).toBe(1);
  });

  it('chuỗi rỗng không tính là bật', () => {
    expect(countActiveFilters(FIELDS, { q: '' })).toBe(0);
  });

  it('"all" là sentinel không-lọc, KHÔNG tính là bật', () => {
    expect(countActiveFilters(SEGMENTED_FIELDS, { scope: 'all' })).toBe(0);
    expect(countActiveFilters(SEGMENTED_FIELDS, { scope: 'platform' })).toBe(1);
  });
});

/* ------------------------------------------------------------------ segmented + select tìm được */

const SEGMENTED_FIELDS: FilterField[] = [
  {
    kind: 'segmented',
    key: 'scope',
    label: 'Phạm vi',
    options: [
      { value: 'all', label: 'Tất cả' },
      { value: 'platform', label: 'Nền tảng' },
      { value: 'tenant', label: 'Gian hàng' },
    ],
  },
];

describe('FilterBar — nhóm nút chọn-một', () => {
  it('hiện hết lựa chọn, không giấu trong dropdown', () => {
    render(<FilterBar fields={SEGMENTED_FIELDS} values={{}} onChange={vi.fn()} />);

    expect(screen.getByText('Tất cả')).toBeTruthy();
    expect(screen.getByText('Nền tảng')).toBeTruthy();
    expect(screen.getByText('Gian hàng')).toBeTruthy();
  });

  it('chọn một nhánh báo ra ngoài đúng giá trị', () => {
    const onChange = vi.fn();
    render(<FilterBar fields={SEGMENTED_FIELDS} values={{ scope: 'all' }} onChange={onChange} />);

    fireEvent.click(screen.getByText('Nền tảng'));
    expect(onChange).toHaveBeenCalledWith({ scope: 'platform' });
  });

  it('không có giá trị thì rơi về lựa chọn đầu tiên', () => {
    const { container } = render(
      <FilterBar fields={SEGMENTED_FIELDS} values={{}} onChange={vi.fn()} />,
    );

    const checked = container.querySelector('.ant-segmented-item-selected');
    expect(checked?.textContent).toBe('Tất cả');
  });

  it('select đánh dấu searchable thì cho gõ để lọc', () => {
    const { container } = render(
      <FilterBar
        fields={[
          {
            kind: 'select',
            key: 'action',
            label: 'Hành động',
            options: [{ value: 'a', label: 'A' }],
            searchable: true,
          },
        ]}
        values={{}}
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector('.ant-select-show-search')).toBeTruthy();
  });

  it('select thường KHÔNG bật ô gõ', () => {
    const { container } = renderBar();

    expect(container.querySelector('.ant-select-show-search')).toBeNull();
  });
});

/* ------------------------------------------------------------------ tìm kiếm + debounce */

describe('FilterBar — ô tìm kiếm', () => {
  it('debounce trước khi báo ra ngoài, không bắn theo từng phím', () => {
    vi.useFakeTimers();
    try {
      const { onChange } = renderBar();

      const input = screen.getByLabelText('Tìm phiếu');
      fireEvent.change(input, { target: { value: 'h' } });
      fireEvent.change(input, { target: { value: 'ho' } });
      fireEvent.change(input, { target: { value: 'honda' } });

      vi.advanceTimersByTime(399);
      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ q: 'honda' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('độ trễ debounce đổi được', () => {
    vi.useFakeTimers();
    try {
      const { onChange } = renderBar({ searchDebounceMs: 100 });

      fireEvent.change(screen.getByLabelText('Tìm phiếu'), { target: { value: 'x' } });
      vi.advanceTimersByTime(100);

      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('trim khoảng trắng; chuỗi trắng → xoá tham số', () => {
    vi.useFakeTimers();
    try {
      const { onChange } = renderBar({ values: { q: 'cu' } });

      fireEvent.change(screen.getByLabelText('Tìm phiếu'), { target: { value: '   ' } });
      vi.advanceTimersByTime(400);

      expect(onChange).toHaveBeenCalledWith({ q: undefined });
    } finally {
      vi.useRealTimers();
    }
  });

  it('HUỶ debounce khi unmount — không ghi URL sau khi rời trang', () => {
    vi.useFakeTimers();
    try {
      const { onChange, unmount } = renderBar();

      fireEvent.change(screen.getByLabelText('Tìm phiếu'), { target: { value: 'honda' } });
      unmount();
      vi.advanceTimersByTime(1000);

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('giá trị từ ngoài (back/xoá lọc) đồng bộ lại vào ô nhập', () => {
    const { rerender } = renderBar({ values: { q: 'honda' } });
    expect((screen.getByLabelText('Tìm phiếu') as HTMLInputElement).value).toBe('honda');

    rerender(<FilterBar fields={FIELDS} values={{}} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Tìm phiếu') as HTMLInputElement).value).toBe('');
  });

  it('giá trị ngoài đổi KHÔNG kích hoạt một lần ghi ngược', () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      const { rerender } = render(
        <FilterBar fields={FIELDS} values={{ q: 'a' }} onChange={onChange} />,
      );
      rerender(<FilterBar fields={FIELDS} values={{ q: 'b' }} onChange={onChange} />);
      vi.advanceTimersByTime(1000);

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------------------------------------------ xoá lọc + hành động */

describe('FilterBar — xoá bộ lọc', () => {
  it('không có filter nào bật thì không hiện nút xoá', () => {
    renderBar({ onClear: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('có filter bật thì hiện nút xoá và gọi onClear', () => {
    const onClear = vi.fn();
    renderBar({ values: { status: 'draft' }, onClear });

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('không truyền onClear thì không bao giờ có nút xoá', () => {
    renderBar({ values: { status: 'draft' } });

    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('hành động riêng của trang được render', () => {
    renderBar({ actions: <Button>Tạo phiếu</Button> });

    expect(screen.getByRole('button', { name: 'Tạo phiếu' })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ khả truy cập */

describe('FilterBar — khả truy cập và bàn phím', () => {
  it('cả cụm là landmark search có tên', () => {
    renderBar();

    expect(screen.getByRole('search', { name: 'Bộ lọc danh sách' })).toBeTruthy();
  });

  it('mọi điều khiển có tên khả truy cập, kể cả khi chỉ có placeholder', () => {
    renderBar();

    expect(screen.getByLabelText('Tìm phiếu')).toBeTruthy();
    expect(screen.getByLabelText('Trạng thái')).toBeTruthy();
  });

  it('ô tìm kiếm tới được bằng Tab (không có tabindex âm)', () => {
    renderBar();

    const input = screen.getByLabelText('Tìm phiếu');
    expect(input.getAttribute('tabindex')).not.toBe('-1');
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it('icon trong ô tìm kiếm là trang trí, không lọt vào tên', () => {
    const { container } = renderBar();

    expect(
      container.querySelector('.anticon-search')?.closest('[aria-hidden="true"]'),
    ).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ khoảng ngày */

describe('FilterBar — khoảng ngày', () => {
  it('đọc YYYY-MM-DD từ URL nhưng HIỂN THỊ theo quy ước Việt Nam', () => {
    // Hai định dạng khác nhau là có chủ đích: URL giữ `YYYY-MM-DD` (sắp xếp được, chuẩn ISO),
    // màn hình hiện `DD/MM/YYYY` (CLAUDE.md §9). Đây cũng là cách `/manage/admin/audit` đang
    // hiển thị từ trước, nên migrate sang FilterBar không đổi thứ người dùng nhìn thấy.
    const { container } = renderBar({ values: { from: '2026-01-01', to: '2026-01-31' } });

    const inputs = container.querySelectorAll('.ant-picker-input input');
    expect((inputs[0] as HTMLInputElement | undefined)?.value).toBe('01/01/2026');
    expect((inputs[1] as HTMLInputElement | undefined)?.value).toBe('31/01/2026');
  });

  it('chỉ có một đầu khoảng ngày vẫn render được', () => {
    const { container } = renderBar({ values: { from: '2026-01-01' } });

    const inputs = container.querySelectorAll('.ant-picker-input input');
    expect((inputs[0] as HTMLInputElement | undefined)?.value).toBe('01/01/2026');
    expect((inputs[1] as HTMLInputElement | undefined)?.value).toBe('');
  });

  it('giá trị ngày rác không làm vỡ render', () => {
    expect(() => renderBar({ values: { from: 'không-phải-ngày' } })).not.toThrow();
  });

  it('hai đầu khoảng ngày dùng đúng hai tham số URL riêng', () => {
    // Hợp đồng: `dateRange` không tự chế một tham số ghép — giữ `from`/`to` như backend đang nhận.
    const field = FIELDS[2]!;
    expect(field.kind).toBe('dateRange');
    if (field.kind === 'dateRange') {
      expect(field.fromKey).toBe('from');
      expect(field.toKey).toBe('to');
    }
  });
});

/* ------------------------------------------------------------------ mobile */

describe('FilterBar — mobile', () => {
  beforeEach(() => {
    viewport.mobile = true;
  });

  it('ô tìm kiếm vẫn nằm ngoài, các filter khác vào nút "Bộ lọc"', () => {
    renderBar();

    expect(screen.getByLabelText('Tìm phiếu')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bộ lọc/ })).toBeTruthy();
    // Chưa mở sheet thì select không có mặt.
    expect(screen.queryByLabelText('Trạng thái')).toBeNull();
  });

  it('mở sheet mới hiện các filter còn lại', () => {
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }));
    expect(screen.getByLabelText('Trạng thái')).toBeTruthy();
  });

  it('số filter đang bật hiện trên nút', () => {
    renderBar({ values: { status: 'draft', from: '2026-01-01' } });

    // Badge của AntD render số đếm cạnh nút.
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('nút xoá lọc vẫn với tới được từ trong sheet', () => {
    const onClear = vi.fn();
    renderBar({ values: { status: 'draft' }, onClear });

    fireEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('không có filter nào ngoài tìm kiếm thì không dựng nút "Bộ lọc" rỗng', () => {
    renderBar({ fields: [{ kind: 'search', key: 'q', label: 'Tìm phiếu' }] });

    expect(screen.queryByRole('button', { name: /Bộ lọc/ })).toBeNull();
  });

  it('sheet dùng lại ResponsiveDialog chứ không tự chế overlay', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /Bộ lọc/ }));

    // `ResponsiveDialog` ở mobile dựng Drawer của AntD; nếu ai đó thay bằng lớp phủ tự chế thì
    // khẳng định này đỏ.
    expect(document.querySelector('.ant-drawer')).toBeTruthy();
  });
});
