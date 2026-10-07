import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useOpenRecordPager } from './use-open-record-pager';

/**
 * Trước/sau theo thứ tự ĐANG THẤY, và vẫn còn khi bản ghi đang mở rời trang — logic rút từ màn
 * Duyệt xe để dùng chung với màn Xe toàn hệ thống.
 */
describe('useOpenRecordPager', () => {
  it('chưa mở gì: hai đầu đều null', () => {
    const { result } = renderHook(() => useOpenRecordPager(['a', 'b', 'c'], undefined));
    expect(result.current).toMatchObject({ previousId: null, nextId: null });
  });

  it('bản ghi ở giữa: hàng xóm hai bên; ở hai đầu: một bên null', () => {
    const ids = ['a', 'b', 'c'];
    expect(renderHook(() => useOpenRecordPager(ids, 'b')).result.current).toMatchObject({
      previousId: 'a',
      nextId: 'c',
    });
    expect(renderHook(() => useOpenRecordPager(ids, 'a')).result.current).toMatchObject({
      previousId: null,
      nextId: 'b',
    });
    expect(renderHook(() => useOpenRecordPager(ids, 'c')).result.current).toMatchObject({
      previousId: 'b',
      nextId: null,
    });
  });

  it('bản ghi đang mở rời trang (đã quyết định xong): giữ thứ tự lúc mở, không tắt cả hai nút', () => {
    const { result, rerender } = renderHook(
      ({ ids, open }: { ids: string[]; open: string }) => useOpenRecordPager(ids, open),
      { initialProps: { ids: ['a', 'b', 'c'], open: 'b' } },
    );
    expect(result.current).toMatchObject({ previousId: 'a', nextId: 'c' });

    rerender({ ids: ['a', 'c'], open: 'b' });
    expect(result.current).toMatchObject({ previousId: 'a', nextId: 'c' });

    // Sang một bản ghi CÒN trên trang ⇒ đọc lại thứ tự của trang hiện tại.
    act(() => result.current.remember());
    rerender({ ids: ['a', 'c'], open: 'c' });
    expect(result.current).toMatchObject({ previousId: 'a', nextId: null });
  });

  it('bản ghi lạ (không thuộc trang, chưa từng thấy): hai đầu null thay vì đoán', () => {
    const { result } = renderHook(() => useOpenRecordPager(['a', 'b'], 'zzz'));
    expect(result.current).toMatchObject({ previousId: null, nextId: null });
  });

  it('thứ tự trang đổi (lọc/sắp xếp lại) khi bản ghi vẫn còn: theo thứ tự mới', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useOpenRecordPager(ids, 'b'),
      { initialProps: { ids: ['a', 'b', 'c'] } },
    );
    rerender({ ids: ['c', 'b', 'a'] });
    expect(result.current).toMatchObject({ previousId: 'c', nextId: 'a' });
  });
});
