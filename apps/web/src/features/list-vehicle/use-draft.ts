'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import type { OwnerProfileValues } from '@xeprime/validators';

import type { QuickVehicleValues } from './schema';

/**
 * Khoá theo NGƯỜI + GIAN HÀNG: bản nháp của tài khoản này không hiện ở tài khoản khác.
 *
 * `tenantId` rỗng có nghĩa thật và phải có khoá riêng: từ 17/09/2026 gian hàng KHÔNG còn được
 * tạo ở bước hồ sơ, nên suốt cả wizard người đăng ký đầu tiên chưa thuộc gian hàng nào. Bản cũ
 * đòi cả hai mảnh mới sinh khoá, tức là đúng nhóm người dễ mất dữ liệu nhất lại là nhóm duy
 * nhất KHÔNG có nháp.
 */
const draftKey = (userId: string, tenantId: string | null) =>
  `xp.list-vehicle.draft.${userId}.${tenantId ?? 'new'}`;

/** Hồ sơ chủ xe đang chờ gửi — khoá theo NGƯỜI, vì lúc này họ chưa có gian hàng nào. */
const ownerDraftKey = (userId: string) => `xp.list-vehicle.owner.${userId}`;

/** Trường KHÔNG bao giờ ghi vào bộ nhớ trình duyệt — ảnh đã tải nằm ở R2, key có thời hạn. */
const OMITTED = ['mainImageUrl', 'images'] as const;

interface Options {
  userId: string | null;
  tenantId: string | null;
  getValues: UseFormGetValues<QuickVehicleValues>;
  setValue: UseFormSetValue<QuickVehicleValues>;
  enabled: boolean;
}

/**
 * Nháp ngắn hạn của wizard đăng xe nhanh, giữ trong `sessionStorage`.
 *
 * Mục đích hẹp: người dùng lỡ F5 hoặc bấm nhầm nút lùi giữa chừng thì không phải gõ lại. Nó
 * KHÔNG phải nguồn dữ liệu — server vẫn là nơi duy nhất giữ xe thật, và bản nháp bị xoá ngay
 * khi tạo xe thành công.
 *
 * Không lưu ảnh và không lưu bất cứ thứ gì thuộc giấy tờ riêng tư: `sessionStorage` là bộ nhớ
 * của trình duyệt, đọc được bằng script — chỗ đó chỉ chứa những gì người dùng vừa tự gõ ra.
 */
export function useQuickVehicleDraft({ userId, tenantId, getValues, setValue, enabled }: Options) {
  const key = userId ? draftKey(userId, tenantId) : null;
  const restored = useRef(false);

  // Khôi phục MỘT lần, ngay khi biết khoá.
  useEffect(() => {
    if (!key || !enabled || restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<QuickVehicleValues>;
      for (const [field, value] of Object.entries(saved)) {
        if ((OMITTED as readonly string[]).includes(field)) continue;
        setValue(field as keyof QuickVehicleValues, value as never, { shouldDirty: false });
      }
    } catch {
      // Nháp hỏng thì bỏ qua — không bao giờ chặn người dùng vì một bộ nhớ tạm.
    }
  }, [enabled, key, setValue]);

  // Ghi định kỳ thay vì mỗi lần gõ: một form ba chục ô ghi theo từng phím là lãng phí.
  useEffect(() => {
    if (!key || !enabled) return;
    const timer = window.setInterval(() => {
      try {
        const values = { ...getValues() } as Record<string, unknown>;
        for (const field of OMITTED) delete values[field];
        sessionStorage.setItem(key, JSON.stringify(values));
      } catch {
        // Hết dung lượng hoặc bị chặn — bỏ qua, bản nháp chỉ là tiện ích.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [enabled, getValues, key]);

  /*
   * Xoá CẢ HAI khoá có thể có của cùng một người. Gian hàng được tạo ở chính lần lưu này, nên
   * `tenantId` vừa chuyển từ rỗng sang có thật: xoá mỗi khoá hiện tại sẽ bỏ lại bản nháp cũ
   * dưới khoá của người CHƯA có gian hàng, và lần đăng xe sau sẽ mở ra với thông tin của chiếc xe trước.
   */
  const clear = useCallback(() => {
    if (!userId) return;
    for (const candidate of new Set([draftKey(userId, tenantId), draftKey(userId, null)])) {
      try {
        sessionStorage.removeItem(candidate);
      } catch {
        // Không có gì để làm — bản nháp sẽ hết hạn cùng phiên trình duyệt.
      }
    }
  }, [tenantId, userId]);

  return { clear };
}

/**
 * Nháp HỒ SƠ CHỦ XE — thứ người dùng gõ ở bước 1 khi họ chưa có gian hàng.
 *
 * Tách khỏi nháp chiếc xe vì nó là một form khác, gửi tới một API khác, và chỉ tồn tại đúng một
 * lần trong đời tài khoản. Gộp vào cùng một bản ghi sẽ bắt bản nháp xe mang theo một khối dữ
 * liệu mà 100% lần dùng sau đó không còn ý nghĩa.
 *
 * ## Vì sao là một EXTERNAL STORE chứ không phải `useState` + effect
 *
 * Giá trị này là nguồn duy nhất cho câu hỏi "đã khai hồ sơ chưa" — wizard đọc nó để quyết định
 * hiện bước hồ sơ hay bước xe. Giữ thêm một bản trong state React là hai nguồn cho một câu hỏi,
 * và bản trong state thì F5 là mất, đúng ca mà nháp này sinh ra để cứu.
 *
 * `useSyncExternalStore` là đường React dành riêng cho việc đọc một kho bên ngoài: SSR trả
 * `null` (server không có `sessionStorage`), client đọc thật, và mọi lần ghi đều báo cho mọi
 * nơi đang đọc. Đọc thẳng trong lúc render thì hydration lệch; đọc trong effect rồi `setState`
 * thì thừa một vòng render và chính là mẫu `react-hooks/set-state-in-effect` cấm.
 *
 * Cùng kỷ luật với nháp xe: `sessionStorage`, chỉ chứa thứ người dùng vừa tự gõ, và bị xoá ngay
 * khi gian hàng được tạo thật.
 */

/**
 * Dự phòng TRONG BỘ NHỚ cho trình duyệt từ chối `sessionStorage`.
 *
 * Ở chế độ riêng tư hoặc khi site data bị chặn, `sessionStorage` NÉM chứ không trả `null` —
 * và nếu ghi rơi vào khoảng không thì ghi xong đọc lại vẫn rỗng, wizard quay về bước hồ sơ ngay
 * sau khi người dùng vừa khai xong. Chỉ dùng khi storage thật sự hỏng: giữ một bản sao song
 * song lúc bình thường là tạo ra hai nguồn cho một câu hỏi.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Chuỗi thô, so sánh theo GIÁ TRỊ — `getSnapshot` vì vậy ổn định giữa hai lần render. */
function readRaw(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string | null): void {
  try {
    if (raw == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, raw);
  } catch {
    if (raw == null) memory.delete(key);
    else memory.set(key, raw);
  }
  for (const listener of listeners) listener();
}

export function useOwnerProfileDraft(userId: string | null) {
  const key = userId ? ownerDraftKey(userId) : null;

  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? readRaw(key) : null),
    // Server không có `sessionStorage`: chưa khai gì cả, và đó cũng là thứ client render lần đầu.
    () => null,
  );

  const value = useMemo<OwnerProfileValues | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OwnerProfileValues;
    } catch {
      // Nháp hỏng thì coi như chưa khai — người dùng khai lại, không ai bị chặn.
      return null;
    }
  }, [raw]);

  const save = useCallback(
    (next: OwnerProfileValues) => {
      if (key) writeRaw(key, JSON.stringify(next));
    },
    [key],
  );

  const clear = useCallback(() => {
    if (key) writeRaw(key, null);
  }, [key]);

  return { value, save, clear };
}
