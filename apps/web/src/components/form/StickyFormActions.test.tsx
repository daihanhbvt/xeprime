import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StickyFormActions } from './StickyFormActions';

afterEach(cleanup);

function renderInForm(
  props: Partial<Parameters<typeof StickyFormActions>[0]> = {},
  onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault()),
) {
  const utils = render(
    <form onSubmit={onSubmit}>
      <StickyFormActions submitLabel="Lưu xe" {...props} />
    </form>,
  );
  return { ...utils, onSubmit };
}

describe('StickyFormActions — hành động chính', () => {
  it('nút gửi mang nhãn của feature', () => {
    renderInForm();

    expect(screen.getByRole('button', { name: 'Lưu xe' })).toBeTruthy();
  });

  it('KHÔNG tự gửi form — nó kích hoạt onSubmit của form bao ngoài', () => {
    const { onSubmit } = renderInForm();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu xe' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('nút gửi là type=submit, không phải nút thường gắn handler', () => {
    renderInForm();

    expect(screen.getByRole('button', { name: 'Lưu xe' }).getAttribute('type')).toBe('submit');
  });
});

describe('StickyFormActions — huỷ', () => {
  it('không truyền onCancel thì không có nút huỷ', () => {
    renderInForm();

    expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull();
  });

  it('có onCancel thì gọi đúng một lần và KHÔNG gửi form', () => {
    const onCancel = vi.fn();
    const { onSubmit } = renderInForm({ onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('nhãn huỷ đổi được', () => {
    renderInForm({ onCancel: vi.fn(), cancelLabel: 'Quay lại' });

    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeTruthy();
  });
});

describe('StickyFormActions — đang gửi và vô hiệu', () => {
  it('submitting hiện trạng thái đang chạy trên nút gửi', () => {
    const { container } = renderInForm({ submitting: true });

    expect(container.querySelector('.ant-btn-loading')).toBeTruthy();
  });

  it('submitting khoá nút huỷ — không bỏ dở giữa chừng', () => {
    renderInForm({ onCancel: vi.fn(), submitting: true });

    expect((screen.getByRole('button', { name: 'Huỷ' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disabled khoá nút gửi nhưng không khoá huỷ', () => {
    renderInForm({ onCancel: vi.fn(), disabled: true });

    expect((screen.getByRole('button', { name: 'Lưu xe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Huỷ' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disabled thì bấm cũng không gửi form', () => {
    const { onSubmit } = renderInForm({ disabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu xe' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('StickyFormActions — hành động phá huỷ', () => {
  it('không truyền thì không có nút phá huỷ', () => {
    const { container } = renderInForm();

    expect(container.querySelector('.ant-btn-dangerous')).toBeNull();
  });

  it('không có confirm thì gọi thẳng', () => {
    const onClick = vi.fn();
    renderInForm({ destructive: { label: 'Xoá xe', onClick } });

    fireEvent.click(screen.getByRole('button', { name: 'Xoá xe' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('có confirm thì phải xác nhận trước', async () => {
    const onClick = vi.fn();
    renderInForm({
      destructive: {
        label: 'Xoá xe',
        onClick,
        confirm: { title: 'Xoá xe này?', okText: 'Xoá' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Xoá xe' }));
    expect(onClick).not.toHaveBeenCalled();

    expect(await screen.findByText('Xoá xe này?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
  });

  it('hành động phá huỷ KHÔNG gửi form', () => {
    const { onSubmit } = renderInForm({ destructive: { label: 'Xoá xe', onClick: vi.fn() } });

    fireEvent.click(screen.getByRole('button', { name: 'Xoá xe' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submitting khoá luôn hành động phá huỷ', () => {
    renderInForm({ submitting: true, destructive: { label: 'Xoá xe', onClick: vi.fn() } });

    expect((screen.getByRole('button', { name: 'Xoá xe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('StickyFormActions — dính hay không dính', () => {
  it('mặc định là thanh dính đáy', () => {
    const { container } = renderInForm();

    expect((container.firstElementChild!.firstElementChild as HTMLElement).className).toContain(
      'sticky',
    );
  });

  it('variant="inline" bỏ dính — dùng khi nằm trong ResponsiveDialog/DetailDrawer', () => {
    const { container } = renderInForm({ variant: 'inline' });

    const bar = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(bar.className).toContain('inline');
    expect(bar.className).not.toContain('sticky');
  });

  it('hai variant cho ra hai class khác nhau — không phải cùng một khối đổi tên', () => {
    const { container: stickyBar } = renderInForm();
    const stickyClass = (stickyBar.firstElementChild!.firstElementChild as HTMLElement).className;

    cleanup();
    const { container: inlineBar } = renderInForm({ variant: 'inline' });
    const inlineClass = (inlineBar.firstElementChild!.firstElementChild as HTMLElement).className;

    expect(stickyClass).not.toBe(inlineClass);
  });
});

describe('StickyFormActions — ranh giới trách nhiệm', () => {
  it('không validate, không gọi API, không đọc quyền: render trần vẫn chạy', () => {
    expect(() => render(<StickyFormActions submitLabel="Lưu" />)).not.toThrow();
  });
});
