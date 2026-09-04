'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { parseApiFieldIssues } from '@/lib/api-field-errors';

export interface ApplyApiFieldErrorsOptions<T extends FieldValues> {
  /**
   * Các field mà form này thật sự có ô nhập.
   *
   * Bắt buộc: `setError` của react-hook-form nhận MỌI tên, kể cả tên không có ô nào —
   * lỗi đó sẽ chặn `handleSubmit` vĩnh viễn mà người dùng không thấy gì để sửa. Backend
   * validate cả những trường form không hiển thị (khoá phái sinh, field chỉ có ở API), nên
   * bộ lọc này là thứ giữ cho form không tự khoá chính nó.
   */
  fields: ReadonlyArray<Path<T>>;
}

/**
 * Lỗi validate của backend → lỗi ĐẶT ĐÚNG Ô NHẬP của react-hook-form.
 *
 * Lý do tồn tại: hai lớp validate (yup ở client, class-validator ở server) không bao giờ trùng
 * khít tuyệt đối. Khi server bắt được thứ yup bỏ lọt, mặc định người dùng chỉ nhận một toast
 * "Dữ liệu gửi lên không hợp lệ" và phải tự đoán ô nào sai trên một form vài chục ô. Hook này
 * biến đúng cái đó thành một dòng đỏ dưới ô có lỗi.
 *
 * Chữ hiện lên là câu CHUNG đã dịch, không phải `message` của backend: backend nói tiếng Việt và
 * class-validator sinh những câu như "must be a number conforming to the specified constraints" —
 * không câu nào nên xuất hiện trước mặt người dùng (ADR 0012). Câu kỹ thuật đi vào console.
 *
 * Trả về danh sách field đã gắn được — rỗng nghĩa là lỗi này không thuộc về ô nào, nơi gọi cứ
 * hiện thông báo chung như trước.
 */
export function useApiFieldErrors(): <T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: ApplyApiFieldErrorsOptions<T>,
) => Path<T>[] {
  const t = useTranslations('Errors');

  return useCallback(
    <T extends FieldValues>(
      error: unknown,
      setError: UseFormSetError<T>,
      options: ApplyApiFieldErrorsOptions<T>,
    ): Path<T>[] => {
      const known = new Set<string>(options.fields);
      const applied: Path<T>[] = [];

      for (const issue of parseApiFieldIssues(error)) {
        if (!known.has(issue.field)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[api] lỗi trường không có ô nhập tương ứng:', issue.field, issue.detail);
          }
          continue;
        }
        const field = issue.field as Path<T>;
        setError(field, { type: 'server', message: t('field.invalid') });
        applied.push(field);
      }

      return applied;
    },
    [t],
  );
}
