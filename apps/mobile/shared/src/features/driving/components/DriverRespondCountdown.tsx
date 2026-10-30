import { useTranslations } from 'use-intl';
import { Countdown } from '@/components/ui/Countdown';

/** Dưới bấy nhiêu thì đồng hồ chuyển sắc cảnh báo — một phần ba cửa sổ ngắn nhất (15′), như web. */
const URGENT_MS = 5 * 60_000;

/**
 * Hạn tài xế phải Nhận/Từ chối một lượt gán (ADR 0066) — bản native của web
 * `DriverRespondCountdown`. Mốc do SERVER chốt lúc gán (`respondBy`); đồng hồ chỉ hiển thị. Không
 * có mốc (chuyến đã nhận / không còn của mình) thì không vẽ gì.
 */
export function DriverRespondCountdown({ respondBy }: { respondBy: string | null | undefined }) {
  const t = useTranslations('Driving.respond');
  if (!respondBy) return null;
  return (
    <Countdown
      deadline={respondBy}
      urgentMs={URGENT_MS}
      labels={{ remaining: t('remaining'), expired: t('expired') }}
    />
  );
}
