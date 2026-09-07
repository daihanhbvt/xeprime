import { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { wholeUnits } from '@xeprime/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { FinanceSeriesBucket } from '../api';

/** Chiều cao vùng vẽ — cùng tỉ lệ với `height={220}` mà web dùng cho khối nhúng trong hồ sơ. */
const PLOT_HEIGHT = 140;

/** Bề rộng một cột (gồm cả khe) — đủ để nhãn ngày hai chữ số không chồng lên nhau. */
const SLOT_WIDTH = 44;

/** Chiều cao tối thiểu của một cột khác 0, để "có tiền nhưng rất ít" không trông như "không có". */
const MIN_BAR = 2;

/** Hình dạng một chuỗi tiền hợp lệ — cùng bộ chặn `toChartValue` của web dùng. */
const MONEY_SHAPE = /^-?\d+(\.\d+)?$/;

/**
 * Doanh thu · Chi phí theo thời gian — bản native của `RevenueTrendChart` bên web.
 *
 * **Dựng bằng View, không dùng SVG.** Một biểu đồ cột đơn thang không cần đường cong hay đường
 * dẫn nào, nên kéo `react-native-svg` vào chỉ để vẽ hình chữ nhật là thêm một native module phải
 * rebuild dev client — cái giá không đổi lấy gì.
 *
 * **Cuộn NGANG khi nhiều cột.** Kỳ "năm nay" ở độ mịn ngày là 365 cột; bóp chúng vào 390px thì
 * mỗi cột rộng một pixel và không đọc được gì. Vùng cuộn ngang là ngoại lệ ĐƯỢC PHÉP duy nhất —
 * thân màn hình vẫn không bao giờ tràn ngang.
 *
 * **Chạm một cột để đọc số.** Native không có hover, nên tooltip của web thành một dòng chi tiết
 * ngay dưới biểu đồ. Lợi nhuận nằm ở dòng đó chứ không thành cột thứ ba: nó là HIỆU của hai cột
 * kia, vẽ thành cột nữa là mời người đọc cộng cả ba lại.
 */
export function RevenueTrendChart({
  buckets,
  labelOf,
  formatMoney,
}: {
  buckets: readonly FinanceSeriesBucket[];
  /** Nhãn trục X đã dựng sẵn theo độ mịn — component không tự đoán ngày. */
  labelOf: (bucket: string) => string;
  formatMoney: (value: string | null | undefined) => string;
}) {
  const t = useTranslations('Finance.entity');
  const [selected, setSelected] = useState<string | null>(null);

  /**
   * Thang chung cho CẢ HAI series: doanh thu và chi phí là tiền cùng đơn vị nên phải so được
   * trực tiếp. Hai thang riêng là cách nhanh nhất để vẽ ra một tương quan không tồn tại.
   *
   * Tiền là CHUỖI trên dây (ADR 0007). Quy sang số CHỈ ở đây và CHỈ để tính chiều cao pixel —
   * không con số nghiệp vụ nào đi ra từ phép quy đổi này. Đi qua `wholeUnits` chứ không
   * `Number()` trần, đúng cách `toChartValue` của web làm: bỏ phần lẻ trên CHUỖI trước rồi mới
   * quy đổi, nên số lớn không mất chính xác dọc đường.
   */
  const max = useMemo(() => {
    let peak = 0;
    for (const bucket of buckets) {
      peak = Math.max(peak, plotValue(bucket.revenue), plotValue(bucket.cost));
    }
    return peak;
  }, [buckets]);

  const active = buckets.find((bucket) => bucket.bucket === selected) ?? null;

  const barHeight = (value: string) => {
    // `max` chỉ bằng 0 khi MỌI cột bằng 0, và lúc đó `amount` cũng là 0 — nhánh dưới đủ.
    const amount = plotValue(value);
    if (amount === 0) return 0;
    return Math.max(MIN_BAR, Math.round((amount / max) * PLOT_HEIGHT));
  };

  return (
    <YStack gap={space.sm}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.xs }}
      >
        <XStack gap={space.xs} ai="flex-end">
          {buckets.map((bucket) => {
            const isActive = bucket.bucket === selected;
            return (
              <Pressable
                key={bucket.bucket}
                onPress={() => setSelected(isActive ? null : bucket.bucket)}
                accessibilityRole="button"
                accessibilityLabel={`${labelOf(bucket.bucket)} · ${formatMoney(bucket.revenue)}`}
              >
                <YStack w={SLOT_WIDTH} ai="center" gap={space.xs}>
                  <XStack h={PLOT_HEIGHT} ai="flex-end" gap={2}>
                    <YStack
                      w={10}
                      h={barHeight(bucket.revenue)}
                      br={radius.sm}
                      bg={colors.success}
                    />
                    <YStack
                      w={10}
                      h={barHeight(bucket.cost)}
                      br={radius.sm}
                      bg={isActive ? colors.danger : colors.dangerSurface}
                    />
                  </XStack>
                  <Text
                    col={isActive ? colors.text : colors.textMuted}
                    fos={fontSize.label}
                    numberOfLines={1}
                  >
                    {labelOf(bucket.bucket)}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </XStack>
      </ScrollView>

      {/* Chú giải — hai màu, đúng hai series được vẽ. */}
      <XStack gap={space.md} ai="center" flexWrap="wrap">
        <LegendDot color={colors.success} label={t('revenue')} />
        <LegendDot color={colors.dangerSurface} label={t('cost')} />
      </XStack>

      {active ? (
        <YStack bg={colors.surfaceMuted} br={radius.md} p={space.sm} gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {labelOf(active.bucket)}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('revenue')}: {formatMoney(active.revenue)}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('cost')}: {formatMoney(active.cost)}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('profit')}: {formatMoney(active.profit)}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * ĐỘ LỚN của một cột, tính bằng đồng nguyên — chỉ để đặt hình, không phải giá trị nghiệp vụ.
 *
 * Lấy TRỊ TUYỆT ĐỐI có chủ đích: hai series ở đây (doanh thu, chi phí) là hai đại lượng dương
 * theo định nghĩa, và cột vẽ từ đáy lên. Số âm nếu có là dữ liệu bất thường — vẽ nó thành cột
 * cao ngược xuống dưới sẽ phá thang chung mà không nói thêm được gì; con số ĐÚNG DẤU vẫn hiện
 * nguyên văn ở dòng chi tiết khi người dùng chạm vào cột.
 */
function plotValue(money: string | null | undefined): number {
  if (!money || !MONEY_SHAPE.test(money)) return 0;
  const value = Math.abs(Number(wholeUnits(money as `${number}`)));
  return Number.isFinite(value) ? value : 0;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack w={10} h={10} br={radius.sm} bg={color} />
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
    </XStack>
  );
}
