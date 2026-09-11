import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnBadgeChange } from './use-on-badge-change';

/**
 * Cầu nối giữa CON SỐ (bản chiếu realtime) và DANH SÁCH đứng sau nó.
 *
 * Bản chiếu chỉ mang con số; hộp thư, danh sách thông báo và số yêu cầu chờ duyệt là những query
 * riêng. Không nối lại thì con số nhảy tức thì còn danh sách đứng im — người dùng thấy "chuông
 * báo có việc mới, mở ra không có gì", đúng lỗi đã gặp ở staging.
 *
 * Hai bẫy ở hai đầu: bỏ qua lần đầu (nếu không thì mỗi lần mount sinh một request thừa ở MỌI
 * trang), và không chạy khi con số không đổi (render lại vì lý do khác không phải là sự kiện).
 */
function Probe({ value, onChange }: { value: number; onChange: () => void }) {
  useOnBadgeChange(value, onChange);
  return null;
}

afterEach(cleanup);

describe('useOnBadgeChange', () => {
  it('KHÔNG chạy ở lần render đầu — query đứng sau đã tự tải rồi', () => {
    const onChange = vi.fn();
    render(<Probe value={3} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('chạy khi con số đổi', () => {
    const onChange = vi.fn();
    const view = render(<Probe value={0} onChange={onChange} />);

    view.rerender(<Probe value={1} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);

    view.rerender(<Probe value={2} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('KHÔNG chạy khi con số giữ nguyên, dù render lại nhiều lần', () => {
    const onChange = vi.fn();
    const view = render(<Probe value={5} onChange={onChange} />);

    view.rerender(<Probe value={5} onChange={onChange} />);
    view.rerender(<Probe value={5} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('con số về 0 cũng là một thay đổi — đọc hết thông báo phải làm mới danh sách', () => {
    const onChange = vi.fn();
    const view = render(<Probe value={4} onChange={onChange} />);

    view.rerender(<Probe value={0} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('luôn gọi bản callback MỚI NHẤT, không phải bản lúc mount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Probe value={0} onChange={first} />);

    view.rerender(<Probe value={1} onChange={second} />);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

/**
 * Tab chạy nền là chỗ lãng phí duy nhất còn lại của cơ chế này.
 *
 * `refetchInterval` của TanStack tự nghỉ khi tab mất focus, nhưng `invalidateQueries` thì không —
 * mà listener Firestore vẫn sống trong tab nền. Không có luật này thì một tab quản lý để quên sẽ
 * tải lại danh sách theo từng thông báo, cho một màn hình không ai nhìn.
 */
describe('useOnBadgeChange — tab bị ẩn', () => {
  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => setVisibility('visible'));

  it('tab ẩn: KHÔNG gọi ngay', () => {
    const onChange = vi.fn();
    const view = render(<Probe value={0} onChange={onChange} />);

    setVisibility('hidden');
    view.rerender(<Probe value={1} onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('quay lại tab: chạy BÙ đúng một lần, dù đã đổi nhiều lượt', () => {
    const onChange = vi.fn();
    const view = render(<Probe value={0} onChange={onChange} />);

    setVisibility('hidden');
    view.rerender(<Probe value={1} onChange={onChange} />);
    view.rerender(<Probe value={2} onChange={onChange} />);
    view.rerender(<Probe value={3} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('quay lại tab mà KHÔNG có thay đổi nào thì không gọi', () => {
    const onChange = vi.fn();
    render(<Probe value={7} onChange={onChange} />);

    setVisibility('hidden');
    setVisibility('visible');

    expect(onChange).not.toHaveBeenCalled();
  });
});
