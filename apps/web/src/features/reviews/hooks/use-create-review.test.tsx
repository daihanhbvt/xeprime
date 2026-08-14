import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/services/query-keys';

import { useCreateReview } from './use-create-review';

/**
 * Gửi đánh giá xong thì màn chuyến phải tự tươi lại (Wave 11.1).
 *
 * `canReview`/`hasReview` và khối "Đánh giá của bạn" nằm trong DTO CHUYẾN, không nằm trong cache
 * review. Thiếu invalidate nhánh `trips` thì gửi xong nút `Đánh giá chuyến đi` vẫn đứng nguyên,
 * bấm lần hai ăn 409 từ server, và cách duy nhất để thoát là F5 cả trang.
 */
vi.mock('../api', () => ({
  createReview: vi.fn(async () => ({ id: 'RV1' })),
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useCreateReview', () => {
  it('làm mới CẢ nhánh chuyến, không chỉ review và marketplace', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateReview(), { wrapper: wrapper(client) });
    result.current.mutate({ bookingId: 'BK1', rating: 5 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.trips.all));
    // Hai nhánh cũ vẫn phải còn: điểm đánh giá công khai của xe cũng vừa đổi.
    expect(keys).toContain(JSON.stringify(queryKeys.reviews.all));
    expect(keys).toContain(JSON.stringify(queryKeys.marketplace.all));
  });
});
