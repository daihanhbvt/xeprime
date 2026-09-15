'use client';

import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ObjectSchema } from 'yup';
import { useTranslations } from 'next-intl';

/**
 * Bọc `yupResolver` để dịch message của schema — bản web của
 * `apps/mobile/src/i18n/use-validation-resolver.ts`, cùng cơ chế cho cả hai nền tảng.
 *
 * Schema trong `@xeprime/validators` chưa dịch hết: chỉ schema nào cố tình đổi message thành MÃ
 * (xem docblock `vehicleSourceFormSchema`) mới cần bọc bằng hook này với đúng `namespace` chứa
 * mã đó. Bọc một schema còn chữ Việt cứng là vô hại — `t.has(code)` không khớp thì giữ nguyên
 * chữ gốc, y hệt hành vi cũ.
 *
 * `fallbackNamespace` cho form GHÉP schema: wizard đăng xe nhanh `pick` phần lớn trường từ
 * `vehicleFormSchema`, nên mã lỗi của nó nằm ở `Vehicles.form.validation` chứ không ở namespace
 * riêng của wizard. Không có vế dự phòng thì những mã đó lọt ra giao diện ở dạng mã trần
 * ("nameRequired") hoặc câu tiếng Anh mặc định của yup — đúng lỗi đang thấy ở ô "Hộp số".
 * Hai lời gọi `useTranslations` cố định (không lặp theo mảng) để số hook mỗi lần render không đổi.
 */
export function useValidationResolver<T extends FieldValues>(
  schema: ObjectSchema<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  namespace: Parameters<typeof useTranslations>[0],
  fallbackNamespace?: Parameters<typeof useTranslations>[0],
): Resolver<T> {
  const t = useTranslations(namespace);
  // `useTranslations` phải chạy vô điều kiện; không có vế dự phòng thì trỏ lại chính namespace
  // đầu — `t.has` khi đó chỉ trả lời đúng một lần nữa, không phát sinh hành vi mới.
  const tFallback = useTranslations(fallbackNamespace ?? namespace);
  const base = useMemo(() => yupResolver(schema), [schema]);

  return useMemo(() => {
    const resolver: Resolver<T> = async (values, context, options) => {
      const result = await base(values, context, options);
      translateErrors(result.errors as Record<string, unknown>, [t, tFallback]);
      return result;
    };
    return resolver;
  }, [base, t, tFallback]);
}

/**
 * Ngăn cách MÃ và tham số trong message của schema: `tiersGap::{"last":5,"radius":10}`.
 *
 * Phần lớn câu lỗi là hằng nên chỉ cần một mã. Số ít câu nhắc lại CHÍNH con số người dùng vừa gõ
 * ("khoảng trống giữa mốc 5 km và 10 km") thì không thể dựng sẵn ở schema — nơi không có ngôn
 * ngữ nào cả — nên schema gửi kèm tham số ở đây, và chỗ này ghép chúng vào bản dịch.
 */
const PARAMS_SEPARATOR = '::';

/**
 * Đệ quy vì `contractFiles` là mảng object — lỗi lồng nhau vẫn phải qua đúng một chỗ dịch.
 *
 * `message` của yup là chuỗi ĐỘNG (đọc từ schema lúc chạy), nên không khớp kiểu union tĩnh mà
 * `useTranslations` yêu cầu cho `t.has`/`t` — ép kiểu ở đúng những lời gọi đó, không phải né
 * kiểu cho cả hàm.
 */
function translateErrors(
  errors: Record<string, unknown>,
  translators: readonly ReturnType<typeof useTranslations>[],
): void {
  for (const value of Object.values(errors)) {
    if (!value || typeof value !== 'object') continue;
    const err = value as { message?: unknown };
    if (typeof err.message === 'string') {
      const translated = translateMessage(err.message, translators);
      if (translated != null) err.message = translated;
    }
    translateErrors(value as Record<string, unknown>, translators);
  }
}

/**
 * `null` = mã không thuộc namespace nào được truyền vào; giữ nguyên chuỗi gốc, y hệt hành vi cũ.
 * Namespace đầu tiên thắng, nên form ghép schema vẫn ghi đè được câu chữ của schema dùng chung.
 */
function translateMessage(
  raw: string,
  translators: readonly ReturnType<typeof useTranslations>[],
): string | null {
  const at = raw.indexOf(PARAMS_SEPARATOR);
  const code = at === -1 ? raw : raw.slice(0, at);
  const t = translators.find((candidate) => candidate.has(code as never));
  if (!t) return null;
  if (at === -1) return t(code as never);
  try {
    return t(code as never, JSON.parse(raw.slice(at + PARAMS_SEPARATOR.length)));
  } catch {
    // Tham số hỏng thì vẫn phải ra được một câu đọc được, không phải một mã trần.
    return t(code as never);
  }
}
