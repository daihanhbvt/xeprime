import { EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTable, actionColumn, type DataTableColumn } from './DataTable';

const viewport = vi.hoisted(() => ({ mobile: false }));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => viewport.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !viewport.mobile,
  useMediaQuery: () => viewport.mobile,
}));

interface Row {
  id: string;
  name: string;
  price: string;
}

const ROWS: Row[] = [
  { id: 'r1', name: 'Honda SH 150i', price: '350.000 ₫' },
  { id: 'r2', name: 'Toyota Vios', price: '900.000 ₫' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { title: 'Xe', key: 'name', render: (_, row) => row.name },
  { title: 'Giá', key: 'price', align: 'right', render: (_, row) => row.price },
];

const META = { page: 1, limit: 20, total: 2, hasNext: false };

function renderTable(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DataTable<Row>
      label="Danh sách xe"
      columns={COLUMNS}
      items={ROWS}
      minWidth={730}
      pagination={{ meta: META, onChange, totalLabel: (total) => `${total} xe` }}
      empty={{ title: 'Gian hàng chưa có xe nào' }}
      {...props}
    />,
  );
  return { ...utils, onChange };
}

beforeEach(() => {
  viewport.mobile = false;
});

afterEach(cleanup);

/* ------------------------------------------------------------------ thứ tự ưu tiên trạng thái */

describe('DataTable — thứ tự ưu tiên trạng thái', () => {
  it('quyền thắng tất cả, kể cả khi có lỗi và có dữ liệu', () => {
    renderTable({
      permission: { missingPermissions: ['vehicles.view'] },
      error: { title: 'Không tải được', onRetry: vi.fn() },
    });

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByText('Không tải được')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lỗi thắng dữ liệu — người gọi chỉ truyền lỗi khi KHÔNG còn dữ liệu hợp lệ', () => {
    renderTable({ error: { title: 'Không tải được danh sách xe', onRetry: vi.fn() } });

    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('đang tải + CHƯA có dữ liệu → skeleton bảng', () => {
    const { container } = renderTable({ items: [], loading: true });

    expect(container.querySelectorAll('.ant-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Gian hàng chưa có xe nào')).toBeNull();
  });

  it('đang tải + ĐÃ có dữ liệu → giữ bảng, không thay bằng skeleton (134:2011 R4)', () => {
    renderTable({ loading: true });

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
  });

  it('lỗi refetch nền: người gọi không truyền error thì dữ liệu vẫn hiển thị', () => {
    // Đây là hợp đồng "không thay dữ liệu đang xem bằng màn lỗi" — thể hiện bằng việc
    // `error` là tuỳ chọn và độc lập với `loading`.
    renderTable({ loading: true, error: null });

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ rỗng vs không-kết-quả */

describe('DataTable — rỗng và không có kết quả', () => {
  it('rỗng không lọc dùng slot empty', () => {
    renderTable({ items: [], empty: { title: 'Gian hàng chưa có xe nào' } });

    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
  });

  it('rỗng + đang lọc dùng slot noResults', () => {
    renderTable({
      items: [],
      filtered: true,
      noResults: { title: 'Không tìm thấy xe khớp bộ lọc' },
    });

    expect(screen.getByText('Không tìm thấy xe khớp bộ lọc')).toBeTruthy();
    expect(screen.queryByText('Gian hàng chưa có xe nào')).toBeNull();
  });

  it('đang lọc nhưng bảng KHÔNG khai noResults thì rơi về empty, không vỡ', () => {
    renderTable({ items: [], filtered: true });

    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
  });

  it('hành động của slot rỗng do feature truyền (phụ thuộc quyền của nó)', () => {
    const onCreate = vi.fn();
    renderTable({
      items: [],
      empty: { title: 'Chưa có xe', action: <Button onClick={onCreate}>Thêm xe đầu tiên</Button> },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Thêm xe đầu tiên' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ lỗi + thử lại */

describe('DataTable — lỗi và thử lại', () => {
  it('nút thử lại gọi onRetry', () => {
    const onRetry = vi.fn();
    renderTable({ error: { title: 'Không tải được', onRetry } });

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('lỗi dùng vùng alert để trình đọc màn hình nhận ngay', () => {
    renderTable({
      error: { title: 'Không tải được', description: 'Vui lòng thử lại.', onRetry: vi.fn() },
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Không tải được');
    expect(alert.textContent).toContain('Vui lòng thử lại.');
  });
});

/* ------------------------------------------------------------------ bảng desktop */

describe('DataTable — bảng ở desktop', () => {
  it('render đủ hàng dữ liệu', () => {
    renderTable();

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
    expect(screen.getByText('Toyota Vios')).toBeTruthy();
  });

  it('có tên khả truy cập cho cả vùng danh sách (130:1658 §2.8)', () => {
    renderTable();

    expect(screen.getByRole('region', { name: 'Danh sách xe' })).toBeTruthy();
  });

  it('đặt sàn bề rộng để cuộn ngang thay vì nén cột (127:2097 R1–R2, R8)', () => {
    const { container } = renderTable({ minWidth: 1050 });

    expect(container.querySelector('.ant-table-content, .ant-table-body')).toBeTruthy();
    // AntD đẩy `scroll.x` xuống `width` của thẻ `<table>`; `min-width: 100%` là mặc định của nó.
    // Đây là cách duy nhất quan sát được rằng sàn bề rộng đã tới nơi.
    expect(container.querySelector('table')?.style.width).toBe('1050px');
  });

  it('cuộn ngang bị giới hạn trong vùng bảng, không đẩy cả trang', () => {
    const { container } = renderTable();

    // Vùng bao có `overflow: hidden` trong CSS Module; ở đây khẳng định nó tồn tại và bọc bảng.
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('region');
    expect(within(root).getByRole('table')).toBeTruthy();
  });

  it('bấm hàng gọi onRowClick với đúng bản ghi', () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });

    fireEvent.click(screen.getByText('Toyota Vios'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]![0]).toEqual(ROWS[1]);
  });

  it('không truyền onRowClick thì hàng không bắt sự kiện', () => {
    const { container } = renderTable();

    expect(container.querySelector('.ant-table-row')?.className).not.toContain('rowClickable');
  });

  it('rowKey mặc định lấy id; ghi đè được cho bảng dùng khoá khác', () => {
    const rows = [{ id: '', name: 'A', price: '0' }] as Row[];
    expect(() => renderTable({ items: rows, rowKey: (row) => `custom-${row.name}` })).not.toThrow();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('zebra mặc định BẬT: hàng lẻ (theo CHỈ SỐ dữ liệu) mang class sọc, hàng chẵn không', () => {
    const { container } = renderTable();

    const rows = container.querySelectorAll('.ant-table-tbody .ant-table-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).not.toContain('rowStriped');
    expect(rows[1]!.className).toContain('rowStriped');
  });

  it('striped={false} tắt zebra cho bảng ngoại lệ', () => {
    const { container } = renderTable({ striped: false });

    for (const row of container.querySelectorAll('.ant-table-tbody .ant-table-row')) {
      expect(row.className).not.toContain('rowStriped');
    }
  });

  it('zebra tính theo chỉ số nên sống chung được với onRowClick (hai className cùng hàng)', () => {
    const { container } = renderTable({ onRowClick: vi.fn() });

    const second = container.querySelectorAll('.ant-table-tbody .ant-table-row')[1]!;
    expect(second.className).toContain('rowStriped');
    expect(second.className).toContain('rowClickable');
  });

  it('chế độ thẻ mobile KHÔNG nhận zebra của bảng', () => {
    viewport.mobile = true;
    const { container } = renderTable({ renderCard: (row) => <span>{row.name}</span> });

    expect(container.querySelector('.ant-table')).toBeNull();
    expect(container.querySelector('[class*="rowStriped"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ cột hành động */

describe('DataTable — cột hành động', () => {
  const withActions = () =>
    renderTable({
      columns: [
        ...COLUMNS,
        actionColumn<Row>((row) => [
          { key: 'view', label: `Xem ${row.name}`, icon: <EyeOutlined />, onClick: vi.fn() },
        ]),
      ],
    });

  it('actionColumn dính phải và có bề rộng cố định (127:2060 R1–R2)', () => {
    const column = actionColumn<Row>(() => []);

    expect(column.fixed).toBe('right');
    expect(column.width).toBe(160);
    expect(column.title).toBe('Thao tác');
    expect(column.key).toBe('actions');
    expect(column.align).toBe('right');
  });

  it('bề rộng đổi được cho bảng dùng nút có chữ', () => {
    expect(actionColumn<Row>(() => [], { width: 120 }).width).toBe(120);
  });

  it('render cột dính phải trong bảng thật', () => {
    const { container } = withActions();

    // AntD 6 dùng thuật ngữ logical: `fix-end`, không phải `fix-right`.
    expect(container.querySelector('.ant-table-cell-fix-end')).toBeTruthy();
    // AntD tự dựng bóng phân tách khi còn nội dung bị che (Figma 127:2060 R4 / 127:2097 R5).
    expect(container.querySelector('.ant-table-cell-fix-end-shadow')).toBeTruthy();
  });

  it('nút hành động có tên khả truy cập riêng cho từng hàng', () => {
    withActions();

    expect(screen.getByRole('button', { name: 'Xem Honda SH 150i' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem Toyota Vios' })).toBeTruthy();
  });

  it('bấm nút hành động KHÔNG kích hoạt click của hàng', () => {
    const onRowClick = vi.fn();
    const onView = vi.fn();
    renderTable({
      onRowClick,
      columns: [
        ...COLUMNS,
        actionColumn<Row>(() => [
          { key: 'view', label: 'Xem', icon: <EyeOutlined />, onClick: onView },
        ]),
      ],
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Xem' })[0]!);

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ phân trang */

describe('DataTable — phân trang', () => {
  it('hiện tổng theo đơn vị của feature', () => {
    renderTable({
      pagination: {
        meta: { ...META, total: 245 },
        onChange: vi.fn(),
        totalLabel: (t) => `${t} xe`,
      },
    });

    expect(screen.getByText('245 xe')).toBeTruthy();
  });

  it('không truyền pagination thì KHÔNG dựng thanh phân trang', () => {
    // `/manage/admin/plans` lấy hết gói trong một lần gọi; Figma `130:1752` ghi đây là ngoại lệ
    // hợp lệ. Dựng thanh phân trang một-trang ở đó là nhiễu, không phải tính năng.
    const { container } = render(
      <DataTable<Row>
        label="Danh sách gói"
        columns={COLUMNS}
        items={ROWS}
        minWidth={900}
        empty={{ title: 'Chưa có gói nào' }}
      />,
    );

    expect(container.querySelector('.ant-pagination')).toBeNull();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('không phân trang vẫn render đủ hàng', () => {
    render(
      <DataTable<Row>
        label="Danh sách gói"
        columns={COLUMNS}
        items={ROWS}
        minWidth={900}
        empty={{ title: 'Chưa có gói nào' }}
      />,
    );

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
    expect(screen.getByText('Toyota Vios')).toBeTruthy();
  });

  it('đổi trang gọi onChange với trang và cỡ trang', () => {
    const onChange = vi.fn();
    renderTable({
      pagination: {
        meta: { page: 1, limit: 20, total: 60, hasNext: true },
        onChange,
        totalLabel: (t) => `${t} xe`,
      },
    });

    fireEvent.click(screen.getByTitle('2'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]).toEqual([2, 20]);
  });
});

/* ------------------------------------------------------------------ mobile */

describe('DataTable — chế độ thẻ ở mobile', () => {
  beforeEach(() => {
    viewport.mobile = true;
  });

  it('có renderCard thì ≤640px dựng danh sách thẻ, không dựng bảng (127:2257 R1)', () => {
    renderTable({ renderCard: (row) => <div>{row.name}</div> });

    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Danh sách xe' });
    // Phải giới hạn trong danh sách thẻ: `Pagination` của AntD cũng là `<ul><li>`, đếm toàn trang
    // sẽ ra cả các nút số trang.
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('KHÔNG có renderCard thì tự chuyển các cột thành thẻ nhãn–giá trị', () => {
    renderTable();

    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Danh sách xe' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('Giá')).toHaveLength(2);
    expect(within(list).getByText('Honda SH 150i')).toBeTruthy();
  });

  it('bấm phần trống của thẻ gọi onRowClick nhưng nút con không làm nổi bọt', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    renderTable({
      onRowClick,
      renderCard: (row) => (
        <div>
          <span>{row.name}</span>
          <button type="button" onClick={onAction}>
            Sửa
          </button>
        </div>
      ),
    });

    fireEvent.click(screen.getByText('Toyota Vios'));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sửa' })[0]!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('phân trang vẫn dùng được ở chế độ thẻ', () => {
    const onChange = vi.fn();
    renderTable({
      renderCard: (row) => <div>{row.name}</div>,
      pagination: {
        meta: { page: 1, limit: 20, total: 60, hasNext: true },
        onChange,
        totalLabel: (t) => `${t} xe`,
      },
    });

    fireEvent.click(screen.getByTitle('2'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('hành động trong thẻ vẫn bấm được', () => {
    const onAction = vi.fn();
    renderTable({
      renderCard: (row) => (
        <div>
          {row.name}
          <button type="button" onClick={onAction}>
            Thu tiền
          </button>
        </div>
      ),
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Thu tiền' })[0]!);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('đang tải + chưa có dữ liệu → skeleton dạng THẺ, không phải dạng hàng bảng', () => {
    const { container } = renderTable({
      items: [],
      loading: true,
      renderCard: (row) => <div>{row.name}</div>,
    });

    expect(container.querySelector('.ant-skeleton-avatar')).toBeTruthy();
  });

  it('rỗng ở chế độ thẻ vẫn hiện đúng câu chữ', () => {
    renderTable({ items: [], renderCard: (row) => <div>{row.name}</div> });

    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
  });

  it('lỗi ở chế độ thẻ vẫn có nút thử lại', () => {
    const onRetry = vi.fn();
    renderTable({
      error: { title: 'Không tải được', onRetry },
      renderCard: (row) => <div>{row.name}</div>,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('thiếu quyền ở chế độ thẻ vẫn ra màn quyền', () => {
    renderTable({ permission: { kind: 'forbidden' }, renderCard: (row) => <div>{row.name}</div> });

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

/* ------------------------------------------------------------------ ranh giới trách nhiệm */

describe('DataTable — không chứa nghiệp vụ', () => {
  it('render được mà không cần provider query, router hay permission nào', () => {
    // Nếu có API call / hook quyền / hook route lọt vào trong, render trần thế này sẽ nổ.
    expect(() => renderTable()).not.toThrow();
  });

  it('không tự sinh cột nào — cột hoàn toàn do feature khai', () => {
    renderTable({ columns: [{ title: 'Chỉ một cột', key: 'only', render: () => 'x' }] });

    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
  });
});
