import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  FEATURE_STATE,
  PLAN_FEATURE_VALUES,
  isFeatureVisible,
  type PlanFeature,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/**
 * "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả gọi đây là **chỗ bán hàng thật sự** của màn "Gói của
 * tôi", và nói rõ nó chỉ thuyết phục khi danh sách viết bằng **ngôn ngữ người dùng**, không phải
 * tên module. Nhãn vì vậy lấy từ nhóm `Domain.planFeature` (dịch cả vi lẫn en), không phải từ
 * khoá cờ.
 *
 * Chỉ liệt kê thứ CHƯA có (`read_only` + `hidden`). Bản trước còn in thêm danh sách "gói hiện tại
 * đang mở" — với một gian hàng đã mua đủ, đó là một cột dấu tích dài chỉ nhắc lại hiện trạng, và
 * nó biến màn quản lý gói thành tờ rơi quảng cáo. Thứ trả lời được một câu hỏi thật ("trả thêm
 * tiền thì được gì") là danh sách còn khoá; không còn gì khoá thì khối này BIẾN MẤT thay vì hiện
 * một dòng tự khen.
 *
 * `read_only` kèm ghi chú *đang chỉ xem* — người dùng phải phân biệt được "chưa bao giờ có" với
 * "có dữ liệu nhưng hết hạn", nếu không họ tưởng sổ cũ đã mất.
 *
 * `onUpgrade` vắng mặt = người xem không có `subscription.purchase` (ADR 0027 điều 2 —
 * `shop_manager` xem được hạn mức nhưng không mua được). Khi đó vẫn liệt kê tính năng còn khoá
 * (họ cần biết vì sao một mục menu vắng), nhưng KHÔNG mời họ bấm vào một luồng API sẽ chặn.
 *
 * KHÔNG bọc trong `Card`: khối này nằm bên trong phần "Gói & hạn mức", vốn đã là một thẻ. Một thẻ
 * nữa lồng vào biến một danh sách ba dòng thành tấm biển to ngang phần nói về gói đang trả tiền.
 */
export function PlanFeatureList({ onUpgrade }: { onUpgrade?: () => void }) {
  const t = useTranslations('Subscription');
  const domainLabel = useDomainLabel();
  const states = useFeatureStates();

  const locked: PlanFeature[] = PLAN_FEATURE_VALUES.filter(
    // Cờ vắng trong cache cũ ⇒ coi như đang mở, cùng mặc định "không khoá ai" của `useFeature`.
    (feature) => (states[feature] ?? FEATURE_STATE.ENABLED) !== FEATURE_STATE.ENABLED,
  );

  if (locked.length === 0) return null;

  return (
    <YStack gap={space.xs}>
      <Text
        col={colors.placeholder}
        fos={fontSize.meta}
        fow={fontWeight.semibold}
        letterSpacing={0.8}
      >
        {t('features.upgrade').toLocaleUpperCase()}
      </Text>

      {locked.map((feature) => (
        <XStack key={feature} ai="center" gap={space.xs}>
          <Ionicons name="lock-closed" size={iconSize.sm} color={colors.placeholder} />
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
            {domainLabel('planFeature', feature)}
            {/* `read_only` = đã có dữ liệu từ kỳ trước; nói ra để không ai tưởng đã mất sổ. */}
            {isFeatureVisible(states[feature] ?? FEATURE_STATE.ENABLED)
              ? `${LIST_SEPARATOR}${t('features.readOnlyHint')}`
              : ''}
          </Text>
        </XStack>
      ))}

      {/*
        Mở thẳng tấm mua gói — người đọc danh sách này đang ở đúng màn đó rồi, một liên kết về
        chính nó là một cú chạm không đi tới đâu.
      */}
      {onUpgrade ? (
        <Button
          label={t('features.upgradeCta')}
          variant="secondary"
          size="sm"
          onPress={onUpgrade}
        />
      ) : null}
    </YStack>
  );
}
