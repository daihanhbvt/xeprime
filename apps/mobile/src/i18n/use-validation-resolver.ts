import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ObjectSchema } from 'yup';
import { useTranslations } from 'use-intl';

/**
 * Bọc `yupResolver` để dịch message của schema — bản native của
 * `apps/web/src/i18n/use-validation-resolver.ts`.
 *
 * Schema trong `@xeprime/validators` chưa dịch hết: chỉ schema nào cố tình đổi message thành MÃ
 * (xem docblock `vehicleSourceFormSchema`) mới cần bọc bằng hook này với đúng `namespace` chứa
 * mã đó. Bọc một schema còn chữ Việt cứng là vô hại — `t.has(code)` không khớp thì giữ nguyên
 * chữ gốc, y hệt hành vi cũ.
 */
export function useValidationResolver<T extends FieldValues>(
  schema: ObjectSchema<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  namespace: Parameters<typeof useTranslations>[0],
): Resolver<T> {
  const t = useTranslations(namespace);
  const base = useMemo(() => yupResolver(schema), [schema]);

  return useMemo(() => {
    const resolver: Resolver<T> = async (values, context, options) => {
      const result = await base(values, context, options);
      translateErrors(result.errors as Record<string, unknown>, t);
      return result;
    };
    return resolver;
  }, [base, t]);
}

/**
 * Đệ quy vì `contractFiles` là mảng object — lỗi lồng nhau vẫn phải qua đúng một chỗ dịch.
 *
 * `message` của yup là chuỗi ĐỘNG (đọc từ schema lúc chạy), nên không khớp kiểu union tĩnh mà
 * `useTranslations` yêu cầu cho `t.has`/`t` — ép kiểu ở đúng hai lời gọi đó, không phải né kiểu
 * cho cả hàm.
 */
function translateErrors(errors: Record<string, unknown>, t: ReturnType<typeof useTranslations>): void {
  for (const value of Object.values(errors)) {
    if (!value || typeof value !== 'object') continue;
    const err = value as { message?: unknown };
    if (typeof err.message === 'string' && t.has(err.message as never)) {
      err.message = t(err.message as never);
    }
    translateErrors(value as Record<string, unknown>, t);
  }
}
