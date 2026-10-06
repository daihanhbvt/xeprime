'use client';

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { API_ERROR_CODE } from '@xeprime/types';
import { useState } from 'react';

import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { useAppZone } from '@/zones/ZoneProvider';
import type { Zone } from '@/zones';

/**
 * QueryClient của web — cấu hình chung cho mọi khu.
 *
 * Tự chữa chiều lệch NGUY HIỂM của cache năng lực (ADR 0027): client tin là còn quyền, server nói
 * đã hết. Hai mã dưới chỉ xuất hiện khi cờ tính năng của gian hàng đã đổi mà `/auth/me` trong cache
 * còn nói khác — làm mới nó ngay là menu và nút bấm khớp lại trong một nhịp.
 *
 * KHÔNG hạ `staleTime` toàn cục để chữa việc này: khoá `auth.me` dùng chung với danh tính và quyền,
 * hạ xuống là gấp ba lưu lượng `/auth/me` của MỌI người dùng để chữa một độ trễ 60 giây thuần hiển
 * thị. Chiều ngược lại (server mở lại quyền TRƯỚC client) đã có nút "Tôi đã gia hạn" ở
 * `FeatureExpiredNotice`. Không có vòng lặp: `/auth/me` không mang `@RequiresFeature`.
 */
export function makeQueryClient(): QueryClient {
  const refreshMeOnFeatureChange = (error: unknown): void => {
    const code = getErrorCode(error);
    if (code === API_ERROR_CODE.FEATURE_READ_ONLY || code === API_ERROR_CODE.FEATURE_NOT_IN_PLAN) {
      void client.invalidateQueries({ queryKey: queryKeys.auth.me() });
    }
  };

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: refreshMeOnFeatureChange }),
    mutationCache: new MutationCache({ onError: refreshMeOnFeatureChange }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // 401/403 retry là vô nghĩa và làm chậm việc hiện màn đăng nhập.
          const status = (error as { status?: number }).status;
          if (status === 401 || status === 403) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}

/**
 * MỘT QueryClient cho MỖI khu (ADR 0053 — mỗi site là một không gian tài khoản riêng).
 *
 * Mọi dữ liệu trong cache đều là của MỘT tài khoản: `/auth/me`, ví, chuyến, hộp thư, huy hiệu…
 * Ở chế độ `path` (máy dev) ba khu chung một origin và chuyển trang phía client, nên một cache dùng
 * chung sẽ đem tài khoản KHÁCH sang site partner: bấm "Trở thành chủ xe" là `/manage/register` đọc
 * `/auth/me` của khách trong cache, tưởng đó là tài khoản đối tác chưa có gian hàng, và bỏ qua form
 * đăng ký. Tách client theo khu thì mỗi khu hỏi lại API bằng cookie của chính nó; quay lại một khu
 * thì cache của khu đó vẫn còn.
 *
 * Ở chế độ `host` mỗi site là một lần tải trang riêng, nên bản đồ chỉ có đúng một client.
 *
 * Bản đồ sống trong state (không phải module scope): module scope là singleton dùng chung giữa các
 * request trên server, tức là rò dữ liệu giữa người dùng.
 */
export function useZoneQueryClient(hostZone: Zone): QueryClient {
  const [clients] = useState(() => new Map<Zone, QueryClient>());
  const zone = useAppZone(hostZone);
  let client = clients.get(zone);
  if (!client) {
    client = makeQueryClient();
    clients.set(zone, client);
  }
  return client;
}
