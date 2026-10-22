'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { FavoriteToggleResult } from '@xeprime/types';
import { useAuthModal } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { deleteFavorite, loadFavoriteStatus, putFavorite } from '../api';
import { beginFavoriteChange, settleFavoriteChange } from '../favorite-cache';
import { saveFavoriteIntent } from '../favorite-intent';

/** Khoá chung của mọi lượt thích/bỏ thích — để biết "còn lượt nào đang bay không" trước khi làm mới danh sách. */
export const FAVORITE_MUTATION_KEY = [...queryKeys.favorites.all, 'mutation'] as const;

interface FavoriteChange {
  /** Trạng thái mong muốn — PUT khi `true`, DELETE khi `false` (cả hai idempotent). */
  desired: boolean;
  /** Trạng thái giao diện lúc bấm — `base` của chuỗi khi cache chưa biết. */
  current: boolean;
  /** Báo "đã lưu" bằng toast — dùng khi lượt lưu chạy SAU đăng nhập, không có cú bấm nào để thấy. */
  announce?: boolean;
}

/**
 * Trái tim của MỘT xe: trạng thái + thao tác thích/bỏ thích, lạc quan (BRD §5.1 · §6.8).
 *
 * - Trạng thái đọc theo khoá RIÊNG của xe, gom lô thành một request cho cả trang (`api.ts`).
 * - Mỗi lượt bấm đổi giao diện ngay; các lượt của CÙNG xe chạy nối tiếp (`scope`), mỗi lượt gửi
 *   trạng thái mong muốn ⇒ bấm dồn dập vẫn hội tụ về lượt cuối. Chỉ lượt cuối hỏng mới hoàn tác,
 *   và hoàn tác về trạng thái server đã xác nhận (`favorite-cache.ts`).
 * - `networkMode: 'always'`: mất mạng thì lượt gọi HỎNG ngay để hoàn tác + báo, chứ không treo ở
 *   trạng thái "tạm dừng" trong khi trái tim vẫn đỏ như đã lưu.
 * - Chưa đăng nhập / phiên hết hạn ⇒ hoàn tác, ghi ý định, mời đăng nhập; đăng nhập xong
 *   `FavoriteIntentResumer` hoàn tất lượt lưu.
 *
 * `initialFavorite`: nơi gọi đã BIẾT trạng thái (thẻ trong trang Xe yêu thích) — khỏi hỏi lại.
 */
export function useFavoriteToggle(vehicleId: string, options: { initialFavorite?: boolean } = {}) {
  const queryClient = useQueryClient();
  const t = useTranslations('Favorites');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { open } = useAuthModal();
  const meQuery = useCurrentUser();
  const signedIn = Boolean(meQuery.data);

  const statusQuery = useQuery({
    queryKey: queryKeys.favorites.status(vehicleId),
    queryFn: () => loadFavoriteStatus(vehicleId),
    enabled: signedIn,
    initialData: options.initialFavorite,
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 2,
  });
  const isFavorite = signedIn ? statusQuery.data === true : false;

  const inviteSignIn = useCallback(
    (desired: boolean) => {
      saveFavoriteIntent(vehicleId, desired);
      open({ mode: AUTH_MODE.LOGIN });
    },
    [open, vehicleId],
  );

  const mutation = useMutation<FavoriteToggleResult, unknown, FavoriteChange>({
    mutationKey: FAVORITE_MUTATION_KEY,
    scope: { id: `favorite:${vehicleId}` },
    networkMode: 'always',
    retry: 0,
    mutationFn: ({ desired }) => (desired ? putFavorite(vehicleId) : deleteFavorite(vehicleId)),
    onMutate: async ({ desired, current }) => {
      // Huỷ lượt đọc đang bay TRƯỚC khi ghi lạc quan — nếu không, nó về sau và ghi đè trái tim.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.favorites.status(vehicleId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.favorites.lists }),
      ]);
      beginFavoriteChange(queryClient, vehicleId, desired, current);
    },
    onSettled: (data, error, variables) => {
      const result = settleFavoriteChange(
        queryClient,
        vehicleId,
        error || !data ? { ok: false } : { ok: true, favorited: data.favorited },
      );
      if (!result.isLast) return;

      if (error) {
        if (isUnauthenticated(error)) inviteSignIn(variables.desired);
        else if (result.rolledBack) {
          message.error(
            t(variables.desired ? 'toast.saveFailed' : 'toast.removeFailed', {
              reason: errorMessage(error),
            }),
          );
        }
      } else if (variables.announce && result.confirmed) {
        message.success(t('toast.saved'));
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.status(vehicleId) });
      // Danh sách chỉ làm mới khi KHÔNG còn lượt của xe nào khác đang bay: tải lại giữa chừng sẽ
      // đưa thẻ vừa bỏ thích (server chưa xoá xong) trở lại màn hình rồi lại biến mất.
      if (queryClient.isMutating({ mutationKey: FAVORITE_MUTATION_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.lists });
      }
    },
  });

  const { mutate } = mutation;

  /** Đặt trạng thái mong muốn — chưa đăng nhập thì ghi ý định và mời đăng nhập. */
  const apply = useCallback(
    (desired: boolean, extra: { announce?: boolean } = {}) => {
      // Đang hỏi `/auth/me` thì cứ gửi — server quyết (401 ⇒ mời đăng nhập ở `onSettled`).
      if (!meQuery.isPending && !meQuery.data) {
        inviteSignIn(desired);
        return;
      }
      mutate({ desired, current: isFavorite, ...extra });
    },
    [meQuery.isPending, meQuery.data, inviteSignIn, mutate, isFavorite],
  );

  const toggle = useCallback(() => apply(!isFavorite), [apply, isFavorite]);

  return { isFavorite, toggle, apply, isSaving: mutation.isPending };
}
