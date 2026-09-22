import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  hostMetricState,
  HOST_METRIC_MIN_SAMPLES,
  HOST_METRIC_STATE,
  HOST_METRIC_WINDOW_DAYS,
  responseSpeedOf,
  type HostMetrics as HostMetricsShape,
} from '@xeprime/types';
import { InfoHint } from '@/components/ui/InfoHint';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * BA CHỈ SỐ của một gian hàng — bản native, dùng chung cho trang gian hàng và trang chi tiết xe.
 *
 * Cùng LUẬT với bản web (`apps/web/src/features/marketplace/components/HostMetrics.tsx`) và
 * cùng bó message (`Shops.metrics`): con số, ngưỡng "đủ dữ liệu" và lời giải thích phải giống
 * hệt nhau trên hai màn hình, nếu không cùng một gian hàng lại có hai lý lịch.
 *
 * ## Chưa đủ mẫu thì nói MỘT câu, không vẽ ba ô trống
 *
 * `null` nghĩa là chưa đủ dữ liệu để nói (ADR 0045 điều 3), và điều đó đúng cho cả ba con số
 * cùng lúc vì chúng chung một mẫu số. Một câu kèm SỐ MẪU THẬT vừa ngắn hơn ba ô "—" vừa kiểm
 * chứng được: "mới có 2 yêu cầu trong 90 ngày" là một sự thật, còn "0%" là một lời vu khống.
 *
 * Dấu "i" giữ phần GIẢI THÍCH, không giữ thông tin bắt buộc: chữ chính đọc được mà không cần
 * chạm gì, và không có số tiền hay hành động nào nằm sau nó.
 */
export function HostMetrics({ metrics }: { metrics: HostMetricsShape }) {
  const t = useTranslations('Shops.metrics');

  if (hostMetricState(metrics.sampleCount) !== HOST_METRIC_STATE.READY) {
    /*
     * "Đặt ngay" KHÔNG cần chờ đủ mẫu: nó là một CÀI ĐẶT của gian hàng chứ không phải một phép
     * đo thống kê, nên nó đúng ngay từ yêu cầu đầu tiên và là thông tin khách cần nhất khi chưa
     * có gì khác để đọc.
     */
    return (
      <YStack gap={space.xs}>
        {metrics.instantBook ? <InstantBadge label={t('instantBook')} /> : null}
        <XStack ai="center" gap={4}>
          <Text col={colors.placeholder} fos={fontSize.label} flexShrink={1}>
            {t('insufficient', { count: metrics.sampleCount, days: HOST_METRIC_WINDOW_DAYS })}
          </Text>
          <InfoHint
            label={t('insufficientHintLabel')}
            content={t('insufficientHint', { min: HOST_METRIC_MIN_SAMPLES })}
          />
        </XStack>
      </YStack>
    );
  }

  const speed = responseSpeedOf(metrics.responseMinutesMedian);
  const items = [
    metrics.responseRatePercent === null
      ? null
      : {
          key: 'responseRate',
          value: t('responseRateValue', { percent: metrics.responseRatePercent }),
          label: t('responseRate'),
          hint: t('responseRateHint', { days: HOST_METRIC_WINDOW_DAYS }),
          hintLabel: t('responseRateHintLabel'),
        },
    /*
     * Trung vị thời gian phản hồi hiện thành DẢI, không phải con số trần: "47 phút" gợi một độ
     * chính xác mà một trung vị trên vài chục mẫu không có. Gian hàng chỉ dùng "Đặt ngay" thì
     * không có mẫu nào do NGƯỜI quyết ⇒ `speed === null`, và ô này mang nhãn "Đặt ngay" thay vì
     * hiện "0 phút".
     */
    speed === null
      ? metrics.instantBook
        ? {
            key: 'instant',
            value: t('instantBook'),
            label: t('responseTime'),
            hint: t('instantBookHint'),
            hintLabel: t('instantBookHintLabel'),
          }
        : null
      : {
          key: 'responseTime',
          value: t(`speed.${speed}`),
          label: t('responseTime'),
          hint: t('responseTimeHint', { days: HOST_METRIC_WINDOW_DAYS }),
          hintLabel: t('responseTimeHintLabel'),
        },
    metrics.acceptKeepRatePercent === null
      ? null
      : {
          key: 'acceptKeep',
          value: t('acceptKeepValue', { percent: metrics.acceptKeepRatePercent }),
          label: t('acceptKeep'),
          hint: t('acceptKeepHint', { days: HOST_METRIC_WINDOW_DAYS }),
          hintLabel: t('acceptKeepHintLabel'),
        },
  ].filter((item) => item !== null);

  if (items.length === 0) return null;

  return (
    <YStack gap={space.xs}>
      <XStack flexWrap="wrap" gap={space.md} accessibilityLabel={t('sectionLabel')}>
        {items.map((item) => (
          <YStack key={item.key} gap={1} minWidth={104}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
              {item.value}
            </Text>
            <XStack ai="center" gap={4}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {item.label}
              </Text>
              <InfoHint label={item.hintLabel} content={item.hint} />
            </XStack>
          </YStack>
        ))}
      </XStack>
      {/* Số mẫu đứng ngoài lưới: nó là CƠ SỞ của cả ba con số, không phải con số thứ tư. */}
      <Text col={colors.placeholder} fos={fontSize.label}>
        {t('basis', { count: metrics.sampleCount, days: HOST_METRIC_WINDOW_DAYS })}
      </Text>
    </YStack>
  );
}

/**
 * "Đặt ngay" là một CÀI ĐẶT, không phải một phép đo — nên nó được phép nổi bật kể cả khi chưa đủ
 * mẫu cho ba con số kia.
 */
function InstantBadge({ label }: { label: string }) {
  return (
    <XStack
      alignSelf="flex-start"
      px={space.sm}
      py={1}
      br={radius.sm}
      bg={colors.successSurface}
      ai="center"
    >
      <Text col={colors.success} fos={fontSize.label} fow={fontWeight.medium}>
        {label}
      </Text>
    </XStack>
  );
}
