'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { PlanFeature } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { queryKeys } from '@/services/query-keys';
import styles from './FeatureExpiredNotice.module.css';

/**
 * Băng "gói đã hết hạn" cho một tính năng đang ở trạng thái `read_only` (ADR 0027 điều 3).
 *
 * Đây là chỗ ADR gọi là "lời nhắc gia hạn đúng chỗ nhất mà nền tảng có": người dùng đang đứng
 * ngay trên màn sổ thu chi của họ, dữ liệu vẫn còn nguyên, và thứ duy nhất mất là quyền GHI.
 * Câu chữ phải nói rõ điều đó — báo "hết hạn" mà không nói "dữ liệu còn nguyên" thì việc đầu
 * tiên người ta làm là gọi hỗ trợ chứ không phải gia hạn.
 *
 * Nút "Tôi đã gia hạn" tồn tại vì một lý do rất cụ thể: `/auth/me` có `staleTime` 60 giây, nên
 * sau khi gói được kích hoạt, giao diện còn nói "hết hạn" thêm tối đa một phút. Hạ `staleTime`
 * toàn cục để chữa việc đó là gấp ba lưu lượng `/auth/me` cho MỌI người dùng — một nút làm mới
 * đúng chỗ rẻ hơn nhiều.
 */
export function FeatureExpiredNotice({
  feature,
  planEndsAt,
}: {
  feature: PlanFeature;
  /** ISO-8601; `null` khi không có gói nào (chưa từng mua, hoặc dữ liệu cũ). */
  planEndsAt?: string | null;
}) {
  const t = useTranslations('ManageCommon');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const queryClient = useQueryClient();

  return (
    <Alert
      className={styles.notice}
      type="warning"
      showIcon
      message={t('feature.expiredTitle', { feature: domainLabel('planFeature', feature) })}
      description={
        planEndsAt
          ? t('feature.expiredBodyWithDate', { date: fmt.date(planEndsAt) })
          : t('feature.expiredBody')
      }
      action={
        <span className={styles.actions}>
          <Link href={ROUTES.MANAGE.SUBSCRIPTION}>
            <Button size="small" type="primary">
              {t('feature.renewCta')}
            </Button>
          </Link>
          <Button
            size="small"
            onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })}
          >
            {t('feature.refreshCta')}
          </Button>
        </span>
      }
    />
  );
}
