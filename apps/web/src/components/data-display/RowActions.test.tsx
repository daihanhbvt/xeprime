import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RowActions, type RowAction } from './RowActions';

afterEach(cleanup);

function action(over: Partial<RowAction> = {}): RowAction {
  return { key: 'view', label: 'Xem', icon: <EyeOutlined />, onClick: vi.fn(), ...over };
}

describe('RowActions — tên khả truy cập', () => {
  it('nút chỉ-icon lấy aria-label từ label', () => {
    render(<RowActions actions={[action({ key: 'view', label: 'Xem chi tiết' })]} />);

    expect(screen.getByRole('button', { name: 'Xem chi tiết' })).toBeTruthy();
  });

  it('KHÔNG có nút icon nào thiếu tên — đây là lỗ a11y D15.2 mà component này sinh ra để vá', () => {
    render(
      <RowActions
        actions={[
          action({ key: 'view', label: 'Xem' }),
          action({ key: 'edit', label: 'Sửa', icon: <EditOutlined /> }),
          action({ key: 'del', label: 'Xoá', icon: <DeleteOutlined />, danger: true }),
        ]}
      />,
    );

    for (const button of screen.getAllByRole('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it('nút có chữ thì chữ là tên, không nhân đôi bằng aria-label', () => {
    render(<RowActions actions={[action({ label: 'Thu tiền', showLabel: true })]} />);

    const button = screen.getByRole('button', { name: 'Thu tiền' });
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(button.textContent).toContain('Thu tiền');
  });
});

describe('RowActions — chạy hành động', () => {
  it('bấm gọi onClick đúng một lần', () => {
    const onClick = vi.fn();
    render(<RowActions actions={[action({ onClick })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('không có hành động nào hiện thì không render gì', () => {
    const { container } = render(<RowActions actions={[action({ hidden: true })]} />);

    expect(container.firstElementChild).toBeNull();
  });

  it('mảng rỗng cũng không render gì', () => {
    const { container } = render(<RowActions actions={[]} />);

    expect(container.firstElementChild).toBeNull();
  });

  it('hành động ẩn do feature lọc theo quyền thì biến mất hoàn toàn', () => {
    render(
      <RowActions
        actions={[
          action({ key: 'view', label: 'Xem' }),
          action({ key: 'del', label: 'Xoá', hidden: true }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Xem' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
  });

  it('chặn sự kiện nổi bọt lên hàng — sửa lỗi D15.7 (bấm nút cũng mở luôn chi tiết)', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();

    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <RowActions actions={[action({ onClick: onAction })]} />
            </td>
          </tr>
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('RowActions — trạng thái vô hiệu và đang chạy', () => {
  it('hành động disabled không gọi onClick', () => {
    const onClick = vi.fn();
    render(<RowActions actions={[action({ disabled: true, onClick })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled vẫn giữ tên khả truy cập', () => {
    render(
      <RowActions actions={[action({ disabled: true, disabledReason: 'Xe đang có lịch thuê' })]} />,
    );

    expect(screen.getByRole('button', { name: 'Xem' })).toBeTruthy();
  });

  it('disabled có lý do thì bọc tooltip thay vì để người dùng đoán', async () => {
    render(
      <RowActions actions={[action({ disabled: true, disabledReason: 'Xe đang có lịch thuê' })]} />,
    );

    fireEvent.mouseOver(screen.getByRole('button', { name: 'Xem' }));
    await waitFor(() => expect(screen.getByText('Xe đang có lịch thuê')).toBeTruthy());
  });

  it('loading hiện trạng thái đang chạy', () => {
    const { container } = render(<RowActions actions={[action({ loading: true })]} />);

    expect(container.querySelector('.ant-btn-loading')).toBeTruthy();
  });
});

describe('RowActions — hành động phá huỷ', () => {
  it('danger đánh dấu nút là nguy hiểm', () => {
    const { container } = render(<RowActions actions={[action({ label: 'Xoá', danger: true })]} />);

    expect(container.querySelector('.ant-btn-dangerous')).toBeTruthy();
  });

  it('có confirm thì phải xác nhận trước khi onClick chạy', async () => {
    const onClick = vi.fn();
    render(
      <RowActions
        actions={[
          action({
            label: 'Xoá',
            danger: true,
            onClick,
            confirm: {
              title: 'Xoá xe này?',
              description: 'Không xoá được nếu còn lịch.',
              okText: 'Xoá',
            },
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(onClick).not.toHaveBeenCalled();

    expect(await screen.findByText('Xoá xe này?')).toBeTruthy();
    expect(screen.getByText('Không xoá được nếu còn lịch.')).toBeTruthy();

    const buttons = screen.getAllByRole('button', { name: 'Xoá' });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
  });

  it('disabled thắng confirm — không mở hộp xác nhận', () => {
    const onClick = vi.fn();
    render(
      <RowActions
        actions={[
          action({ label: 'Xoá', disabled: true, onClick, confirm: { title: 'Chắc chứ?' } }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(screen.queryByText('Chắc chứ?')).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('RowActions — menu tràn', () => {
  it('dưới ngưỡng thì không có nút ⋮', () => {
    render(
      <RowActions actions={[action({ key: 'a', label: 'A' }), action({ key: 'b', label: 'B' })]} />,
    );

    expect(screen.queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
  });

  it('vượt maxInline thì phần dư vào menu ⋮', async () => {
    const onOverflow = vi.fn();
    render(
      <RowActions
        maxInline={2}
        actions={[
          action({ key: 'a', label: 'A' }),
          action({ key: 'b', label: 'B' }),
          action({ key: 'c', label: 'C', onClick: onOverflow }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'B' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'C' })).toBeNull();

    const trigger = screen.getByRole('button', { name: 'Thêm thao tác' });
    fireEvent.click(trigger);

    const item = await screen.findByRole('menuitem', { name: 'C' });
    fireEvent.click(item);

    await waitFor(() => expect(onOverflow).toHaveBeenCalledTimes(1));
  });

  it('nút ⋮ có tên khả truy cập, đổi được theo ngữ cảnh', () => {
    render(
      <RowActions
        maxInline={1}
        overflowLabel="Thêm thao tác cho xe Honda SH"
        actions={[action({ key: 'a', label: 'A' }), action({ key: 'b', label: 'B' })]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Thêm thao tác cho xe Honda SH' })).toBeTruthy();
  });

  it('hành động ẩn không chiếm suất inline', () => {
    render(
      <RowActions
        maxInline={2}
        actions={[
          action({ key: 'a', label: 'A', hidden: true }),
          action({ key: 'b', label: 'B' }),
          action({ key: 'c', label: 'C' }),
        ]}
      />,
    );

    // A ẩn → B và C vẫn nằm inline, không đẩy C xuống menu.
    expect(screen.getByRole('button', { name: 'B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'C' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
  });
});

describe('RowActions — ranh giới trách nhiệm', () => {
  it('không đọc quyền: chỉ dựng đúng những gì được truyền', () => {
    // Hợp đồng không có prop permission nào; feature lọc trước bằng `hidden`.
    const { container } = render(
      <RowActions actions={[action({ hidden: true }), action({ key: 'b', label: 'B' })]} />,
    );

    expect(within(container).getAllByRole('button')).toHaveLength(1);
  });
});
