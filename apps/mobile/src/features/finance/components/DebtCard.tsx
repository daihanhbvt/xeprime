import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { DebtItem } from '../api';

/** Chiều cao thanh thu hồi — mảnh hơn `ProgressBar` (8pt) vì nó là nét phụ, không phải số liệu chính. */
const TRACK_HEIGHT = 6;

const FULL_PERCENT = 100;

/**
 * Tỉ lệ ĐÃ THU trên PHẢI THU, chỉ để vẽ thanh.
 *
 * `Number()` trên chuỗi tiền chỉ được phép ở đây: đầu ra là một bề rộng phần trăm, không phải một
 * con số hiện cho người dùng — mọi số tiền trong thẻ vẫn đi thẳng từ chuỗi qua `fmt.money` (ADR 0007).
 */
function paidPercent(paid: string, total: string): number {
  const totalValue = Number(total);
  if (!Number.isFinite(totalValue) || totalValue <= 0) return FULL_PERCENT;
  const ratio = (Number(paid) / totalValue) * FULL_PERCENT;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(FULL_PERCENT, Math.max(0, ratio));
}

/**
 * Một đơn còn nợ — bản native của một dòng `DebtTable`.
 *
 * **Trạng thái đơn nằm ở góc PHẢI trên**, đối diện tên khách + mã đơn: hai thứ đó là hai câu hỏi
 * khác nhau ("ai nợ" ↔ "đơn đang ở giai đoạn nào") nên đặt hai đầu một hàng thay vì xếp chồng —
 * tiết kiệm một dòng trên mỗi thẻ, mà danh sách công nợ là danh sách người ta cuộn rất dài.
 * Trạng thái vẫn đọc được TRƯỚC các con số vì nó ở tầng trên cùng: một đơn `reserved`/`confirmed`
 * (xe chưa ra khỏi bãi) còn nợ là chuyện bình thường, không phải việc phải đi đòi.
 *
 * Màu trạng thái lấy từ `BOOKING_STATUS_META` dùng chung (ADR 0005) — cùng một trạng thái ở lịch,
 * ở chi tiết đơn và ở đây luôn ra cùng màu.
 */
function DebtCardImpl({
  debt,
  canView,
  canCollect,
  onView,
  onCollect,
}: {
  debt: DebtItem;
  canView: boolean;
  canCollect: boolean;
  onView: (debt: DebtItem) => void;
  onCollect: (debt: DebtItem) => void;
}) {
  const t = useTranslations('Finance.debts.table');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = debt.status as BookingStatus;
  const percent = paidPercent(debt.paidAmount, debt.totalAmount);

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          Tầng 1 — DANH TÍNH bên trái, TRẠNG THÁI bên phải.
          `f={1} minWidth={0}` ở cột trái là thứ giữ viên nhãn không bị đẩy khỏi mép phải khi tên
          khách dài: trong React Native khối flex không tự co dưới nội dung của nó.
        */}
        <XStack ai="flex-start" gap={space.sm}>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
              {debt.customerName}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {[debt.code, debt.customerPhone].filter(Boolean).join(LIST_SEPARATOR)}
            </Text>
          </YStack>
          <StatusBadge
            label={domainLabel('bookingStatus', status, BOOKING_STATUS_META[status].label)}
            color={BOOKING_STATUS_META[status].color}
            size="sm"
          />
        </XStack>

        {/*
          Tầng 2 — XE và HẠN TRẢ trên MỘT dòng, có biểu tượng dẫn.
          Hai dòng `DataRow` nhãn-giá-trị cho hai giá trị ngắn này ăn hết nửa chiều cao thẻ mà
          không nói thêm gì: "Xe" và "Đến hạn trả" đọc ra được từ chính giá trị và biểu tượng.
        */}
        <XStack ai="center" gap={space.md}>
          <XStack f={1} minWidth={0} ai="center" gap={space.xs}>
            <Ionicons name="car-outline" size={iconSize.sm} color={colors.textMuted} />
            <Text f={1} col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {debt.vehicleName}
            </Text>
          </XStack>
          <XStack ai="center" gap={space.xs}>
            <Ionicons name="calendar-outline" size={iconSize.sm} color={colors.textMuted} />
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {fmt.date(debt.returnAt)}
            </Text>
          </XStack>
        </XStack>

        <Divider />

        {/*
          Tầng 3 — CÒN NỢ là con số người thu đọc to, đứng một mình bên phải ở cỡ tiêu đề; nhãn
          "Còn nợ" và cặp "đã trả / tổng" nằm bên trái ở cỡ chữ phụ. Không tô nền đỏ cả khối nữa:
          trong một danh sách dài, hai chục mảng đỏ liền nhau làm mất hẳn tác dụng cảnh báo của
          màu — chỉ CON SỐ ăn màu, phần nền để yên.
        */}
        <XStack ai="flex-end" jc="space-between" gap={space.sm}>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
              {t('columns.debt')}
            </Text>
            <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
              {fmt.money(debt.paidAmount)} / {fmt.money(debt.totalAmount)}
            </Text>
          </YStack>
          <Text col={colors.danger} fos={fontSize.h4} fow={fontWeight.bold} numberOfLines={1}>
            {fmt.money(debt.debtAmount)}
          </Text>
        </XStack>

        {/*
          Thanh THU HỒI: phần đã thu trên tổng phải thu. Nó là thứ phân biệt được ngay "đơn mới
          đặt chưa trả đồng nào" với "đơn đã trả gần hết còn thiếu ít" — hai việc rất khác nhau
          mà ba con số tiền đứng cạnh nhau bắt người đọc tự nhẩm mới ra.
        */}
        <YStack
          h={TRACK_HEIGHT}
          br={radius.pill}
          bg={colors.surfaceMuted}
          ov="hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: FULL_PERCENT, now: Math.round(percent) }}
        >
          <YStack h={TRACK_HEIGHT} br={radius.pill} bg={colors.success} width={`${percent}%`} />
        </YStack>

        {canView || canCollect ? (
          <XStack gap={space.sm}>
            {canView ? (
              <YStack f={1}>
                <Button
                  label={t('actions.view')}
                  variant="secondary"
                  size="sm"
                  icon="eye-outline"
                  shape="square"
                  onPress={() => onView(debt)}
                />
              </YStack>
            ) : null}
            {canCollect ? (
              <YStack f={1}>
                <Button
                  label={t('actions.collect')}
                  variant="accent"
                  size="sm"
                  icon="cash-outline"
                  shape="square"
                  onPress={() => onCollect(debt)}
                />
              </YStack>
            ) : null}
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

export const DebtCard = memo(DebtCardImpl);
