'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { apiRequest, getErrorMessage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { PlatformProvince, UpdateProvinceInput } from '../types';

/** Danh mục đầy đủ cho admin nền tảng — kèm số chi nhánh/xe để biết tắt đi thì ảnh hưởng ai. */
export function useAdminProvinces(q: string) {
  const params = q ? { q } : {};
  return useQuery({
    queryKey: queryKeys.locations.admin(params),
    queryFn: async (): Promise<PlatformProvince[]> => {
      const res = await apiRequest<{ items: PlatformProvince[] }>('/platform/locations', {
        query: params,
      });
      return res.data.items;
    },
  });
}

/**
 * Bật/tắt cờ hiển thị của một tỉnh.
 *
 * Cập nhật LẠC QUAN vì đây là công tắc: chờ round-trip mới đổi trạng thái làm nút có cảm giác
 * kẹt. Hỏng thì `onError` trả lại giá trị cũ — không để UI nói một đằng, server một nẻo.
 *
 * Đổi hiển thị công khai làm mới luôn nhánh marketplace: điểm đến và kết quả tìm kiếm đang
 * cache sẽ còn chứa tỉnh vừa bị ẩn nếu không invalidate.
 */
export function useUpdateProvince() {
  const qc = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: async (input: UpdateProvinceInput & { code: string }): Promise<PlatformProvince> => {
      const { code, ...body } = input;
      const res = await apiRequest<PlatformProvince>(`/platform/locations/${code}`, {
        method: 'PATCH',
        body,
      });
      return res.data;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.locations.all });
      const snapshots = qc.getQueriesData<PlatformProvince[]>({
        queryKey: queryKeys.locations.all,
      });
      for (const [key, rows] of snapshots) {
        if (!rows) continue;
        qc.setQueryData<PlatformProvince[]>(
          key,
          rows.map((p) => (p.code === input.code ? { ...p, ...input } : p)),
        );
      }
      return { snapshots };
    },
    onError: (error, _input, context) => {
      // Trả lại đúng ảnh chụp trước đó — rollback thủ công vì đã sửa nhiều query key cùng lúc.
      for (const [key, rows] of context?.snapshots ?? []) qc.setQueryData(key, rows);
      message.error(getErrorMessage(error));
    },
    onSuccess: () => message.success('Đã cập nhật danh mục'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.locations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}
