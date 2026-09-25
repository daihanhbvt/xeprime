import { Ionicons } from '@expo/vector-icons';
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

interface MetricVisual {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

/**
 * Icon + tông màu theo TỪNG chỉ số — thuần trang trí, không đổi ngưỡng hay dữ liệu bên dưới.
 *
 * Cùng bảng với `ITEM_VISUAL` của bản web; tên icon đổi theo bộ Ionicons của app, nhưng NGHĨA
 * và tông màu phải trùng — ba ô này đứng cạnh nhau ở hai bề mặt của cùng một gian hàng.
 */
const ITEM_VISUAL: Record<string, MetricVisual> = {
  responseRate: { icon: 'chatbubble-ellipses-outline', color: colors.success },
  responseTime: { icon: 'time-outline', color: colors.warning },
  instant: { icon: 'time-outline', color: colors.warning },
  acceptKeep: { icon: 'trending-up-outline', color: colors.info },
};

/**
 * Ô mang khoá lạ vẫn phải vẽ được. Không khoá nào ngoài bốn cái trên tới được đây hôm nay, nhưng
 * `noUncheckedIndexedAccess` nói đúng: một phép tra bảng vẫn có thể trượt, và vỡ cả khối uy tín
 * vì một icon là cái giá sai cho một chi tiết trang trí.
 */
const FALLBACK_VISUAL: MetricVisual = { icon: 'trending-up-outline', color: colors.info };

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
 * ## Không còn dòng "tính trên N yêu cầu trong 90 ngày"
 *
 * Bỏ 23/09/2026 cùng lúc với bản web: nó là dòng chữ thứ tư dưới một khối vốn đã có ba con số,
 * và nó lặp lại đúng thứ mà dấu "i" của từng ô đã nói kỹ hơn (mẫu số là gì, cửa sổ bao nhiêu
 * ngày). Khoá `Shops.metrics.basis` đã bị XOÁ khỏi bó message dùng chung — gọi lại nó không
 * phải một dòng chữ thừa mà là một lỗi biên dịch. Trạng thái CHƯA ĐỦ MẪU vẫn nói thẳng số mẫu
 * thật, vì ở đó con số đó là nội dung chính chứ không phải chú thích.
 *
 * Dấu "i" giữ phần GIẢI THÍCH, không giữ thông tin bắt buộc: chữ chính đọc được mà không cần
 * chạm gì, và không có số tiền hay hành động nào nằm sau nó.
 */
export function HostMetrics({ metrics }: { metrics?: HostMetricsShape | null }) {
  const t = useTranslations('Shops.metrics');

  /*
   * THIẾU HẲN khối chỉ số ≠ chưa đủ mẫu — và hai ca đó phải nói hai điều khác nhau.
   *
   * Hợp đồng API khai `metrics` là bắt buộc, nhưng một máy chủ chưa lên bản mới vẫn trả thiếu nó
   * (staging đã gặp: cả trang chi tiết xe trắng màn vì một `.sampleCount` trên `undefined`). Một
   * trường vắng mặt không được phép hạ cả màn hình — phần còn lại của trang vẫn là thứ khách vào
   * đây để đọc.
   *
   * Rơi về `EMPTY_HOST_METRICS` thì sai theo hướng khác: nó in ra "mới có 0 yêu cầu trong 90
   * ngày", một lời khẳng định về gian hàng mà app KHÔNG biết có đúng không. Không biết thì không
   * nói gì.
   */
  if (!metrics) return null;

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
    <XStack flexWrap="wrap" gap={space.md} rowGap={space.sm} accessibilityLabel={t('sectionLabel')}>
      {items.map((item) => {
        const visual = ITEM_VISUAL[item.key] ?? FALLBACK_VISUAL;
        return (
          <XStack key={item.key} ai="flex-start" gap={space.xs} minWidth={116} f={1}>
            <Ionicons name={visual.icon} size={16} color={visual.color} />
            <YStack f={1} gap={1}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {item.value}
              </Text>
              {/*
                Nhãn và dấu "i" nằm trong MỘT hàng biết xuống dòng: nhãn dài ("Thời gian phản
                hồi") phải gãy dòng được ở bề ngang hẹp, và dấu "i" chảy theo ngay sau chữ cuối
                thay vì bị đẩy sang một cột riêng — đúng lý do bản web bỏ flex ở chỗ này.
              */}
              <XStack ai="center" gap={4} flexWrap="wrap">
                <Text col={colors.textMuted} fos={fontSize.label} flexShrink={1}>
                  {item.label}
                </Text>
                <InfoHint label={item.hintLabel} content={item.hint} />
              </XStack>
            </YStack>
          </XStack>
        );
      })}
    </XStack>
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
