'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';

import type { QuickVehicleValues } from './schema';

/** Khoá theo NGƯỜI + GIAN HÀNG: bản nháp của tài khoản này không hiện ở tài khoản khác. */
const draftKey = (userId: string, tenantId: string) => `xp.list-vehicle.draft.${userId}.${tenantId}`;

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
  const key = userId && tenantId ? draftKey(userId, tenantId) : null;
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

  const clear = useCallback(() => {
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Không có gì để làm — bản nháp sẽ hết hạn cùng phiên trình duyệt.
    }
  }, [key]);

  return { clear };
}
