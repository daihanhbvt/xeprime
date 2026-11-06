import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { queryKeys } from '@xeprime/api-client';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { subscribeSessionEnded } from '@/lib/auth-session';
import { logger } from '@/lib/logger';

/** Bản cache cũ hơn mức này thì bỏ — xem lại bản 2 ngày trước dễ hiểu nhầm hơn là không có gì. */
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PERSIST_STORAGE_KEY = 'XP_QUERY_CACHE';

const TRIPS = queryKeys.trips.all[0];
const FAVORITES_LIST = queryKeys.favorites.lists;
const MARKETPLACE_LISTING = queryKeys.marketplace.listing('')[1];

/**
 * DANH SÁCH TRẮNG các query được ghi xuống máy để offline vẫn xem lại bản gần nhất. Danh sách
 * trắng chứ không phải danh sách đen: query mới thêm vào app mặc định KHÔNG bị ghi ra đĩa.
 *
 * Được ghi (khách hay mở lại, không chứa chứng danh):
 * - `['trips','list',…]` · `['trips','detail',id]` — chuyến của khách (KHÔNG gồm nhánh con:
 *   biên bản bàn giao, ảnh ký URL, xem trước huỷ, `unpaid-holds`).
 * - `['favorites','list',…]` — xe yêu thích.
 * - `['marketplace','listing',id]` — chi tiết xe đã xem.
 *
 * CỐ Ý không ghi: `auth/me` và mọi thứ về phiên, ví/điểm, hold/QR/lượt cổng thanh toán, chat,
 * thông báo, dữ liệu gian hàng (app Partner). Tiền/trạng thái thanh toán trong chi tiết chuyến
 * chỉ hiển thị kèm nhãn "dữ liệu cũ" khi offline (`StaleDataNote`), và mọi hành động tiền đều
 * bị khoá khi offline.
 */
export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  if (!defaultShouldDehydrateQuery(query as Query)) return false; // chỉ query `success`
  const key = query.queryKey;
  if (key[0] === TRIPS) {
    return (key[1] === 'list' && key.length === 3) || (key[1] === 'detail' && key.length === 3);
  }
  if (key[0] === FAVORITES_LIST[0] && key[1] === FAVORITES_LIST[1]) return key.length === 3;
  if (key[0] === queryKeys.marketplace.all[0] && key[1] === MARKETPLACE_LISTING) return key.length === 3;
  return false;
}

/*
 * Kho lưu = MỘT file JSON trong thư mục cache của app (expo-file-system). Không dùng
 * AsyncStorage: module đó làm hỏng build Android trên Windows (đường dẫn codegen > 260 ký tự).
 * Thư mục cache là đúng chỗ: hệ điều hành dọn được khi thiếu chỗ, và mất nó chỉ là mất bản xem
 * offline. Lỗi đọc/ghi bị nuốt — cache hỏng không được làm hỏng app; đọc lỗi ⇒ null ⇒ tải mới.
 */
function cacheFile(key: string): File {
  return new File(Paths.cache, `${key}.json`);
}

const fileStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const file = cacheFile(key);
      return file.exists ? await file.text() : null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      cacheFile(key).write(value);
    } catch (error) {
      logger.warn('Không ghi được cache query', {
        message: error instanceof Error ? error.message : null,
      });
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const file = cacheFile(key);
      if (file.exists) file.delete();
    } catch {
      // Không có file / không xoá được — lần ghi sau ghi đè, buster + maxAge vẫn chặn bản cũ.
    }
  },
};

export const queryPersister = createAsyncStoragePersister({
  storage: fileStorage,
  key: PERSIST_STORAGE_KEY,
  // Gom các lần ghi — danh sách chuyến refetch liên tục không nên đập đĩa mỗi lần.
  throttleTime: 2000,
});

export const queryPersistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  // Đổi phiên bản app ⇒ bỏ cache cũ: hình dạng DTO có thể đã đổi giữa hai bản.
  buster: Constants.expoConfig?.version ?? 'dev',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

/** Xoá bản cache trên đĩa — dữ liệu chuyến của tài khoản vừa ra không để lại cho người kế tiếp. */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await queryPersister.removeClient();
  } catch (error) {
    logger.warn('Không xoá được cache query đã lưu', {
      message: error instanceof Error ? error.message : null,
    });
  }
}

// Phiên kết thúc (đăng xuất / refresh bị từ chối) ⇒ dọn đĩa. `SessionBoundary` dọn cache bộ nhớ.
subscribeSessionEnded(() => {
  void clearPersistedQueryCache();
});
