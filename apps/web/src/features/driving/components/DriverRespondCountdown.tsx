'use client';

import { useTranslations } from 'next-intl';
import { Countdown } from '@/components/data-display/Countdown';

/** Dưới bấy nhiêu thì đồng hồ chuyển sắc cảnh báo — một phần ba cửa sổ ngắn nhất (15′). */
const URGENT_MS = 5 * 60_000;

/**
 * Hạn tài xế phải Nhận/Từ chối một lượt gán (ADR 0066). Mốc do SERVER chốt lúc gán
 * (`respondBy`); đồng hồ chỉ hiển thị — cửa chặn thật nằm trong câu `UPDATE` của lượt Nhận.
 * Không có mốc (chuyến đã nhận / không còn của mình) thì không vẽ gì.
 */
export function DriverRespondCountdown({
  respondBy,
  className,
}: {
  respondBy: string | null | undefined;
  className?: string;
}) {
  const t = useTranslations('Driving.respond');
  if (!respondBy) return null;
  return (
    <Countdown
      deadline={respondBy}
      urgentMs={URGENT_MS}
      labels={{ remaining: t('remaining'), expired: t('expired') }}
      className={className}
    />
  );
}
