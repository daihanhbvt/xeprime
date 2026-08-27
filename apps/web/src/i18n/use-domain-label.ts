'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createDomainLabel, type DomainLabel } from './domain';

/**
 * Dịch một giá trị nghiệp vụ (status, vai trò, loại xe, phương thức thanh toán…) sang nhãn
 * của ngôn ngữ đang dùng.
 *
 * Hiện thực nằm ở `createDomainLabel` để Server Component dùng lại được cùng một hàm
 * (`getAppFormat`); hook này chỉ nối nó với bộ dịch của request.
 *
 * Bản đồ `*_LABEL` / `*_STATUS_META` trong `@xeprime/types` GIỮ NGUYÊN: apps/api vẫn dùng
 * chúng cho email/thông báo, và `color` của meta vẫn là nguồn màu. Ở web, `label` tiếng Việt
 * trong meta trở thành nhãn dự phòng cho status cũ chưa kịp khai báo message.
 */
export function useDomainLabel(): DomainLabel {
  const t = useTranslations('Domain');
  return useMemo(() => createDomainLabel(t as never), [t]);
}
