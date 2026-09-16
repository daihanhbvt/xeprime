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
import { Card } from '@/components/ui/Card';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/**
 * "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả gọi đây là **chỗ bán hàng thật sự** của màn "Gói của
 * tôi", và nói rõ nó chỉ thuyết phục khi danh sách viết bằng **ngôn ngữ người dùng**, không phải
 * tên module. Nhãn vì vậy lấy từ nhóm `Domain.planFeature` (dịch cả vi lẫn en), không phải từ
 * khoá cờ.
 *
 * Ba trạng thái gộp thành HAI cột, có chủ đích:
 *  - `enabled` → "đang mở";
 *  - `read_only` và `hidden` → "nâng cấp để mở thêm". `read_only` kèm ghi chú *đang chỉ xem* —
 *    người dùng phải phân biệt được "chưa bao giờ có" với "có dữ liệu nhưng hết hạn", nếu không
 *    họ tưởng sổ cũ đã mất.
 */
export function PlanFeatureList({ onUpgrade }: { onUpgrade: () => void }) {
  const t = useTranslations('Subscription');
  const domainLabel = useDomainLabel();
  const states = useFeatureStates();

  const included: PlanFeature[] = [];
  const locked: PlanFeature[] = [];
  for (const feature of PLAN_FEATURE_VALUES) {
    // Cờ vắng trong cache cũ ⇒ coi như đang mở, cùng mặc định "không khoá ai" của `useFeature`.
    const state = states[feature] ?? FEATURE_STATE.ENABLED;
    (state === FEATURE_STATE.ENABLED ? included : locked).push(feature);
  }

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('features.title')}
        </Text>

        {included.length > 0 ? (
          <YStack gap={space.xs}>
            <GroupTitle>{t('features.included')}</GroupTitle>
            {included.map((feature) => (
              <FeatureRow key={feature} label={domainLabel('planFeature', feature)} unlocked />
            ))}
          </YStack>
        ) : null}

        {locked.length > 0 ? (
          <YStack gap={space.xs}>
            <GroupTitle>{t('features.upgrade')}</GroupTitle>
            {locked.map((feature) => (
              <FeatureRow
                key={feature}
                label={domainLabel('planFeature', feature)}
                unlocked={false}
                /* `read_only` = đã có dữ liệu từ kỳ trước; nói ra để không ai tưởng đã mất sổ. */
                {...(isFeatureVisible(states[feature] ?? FEATURE_STATE.ENABLED)
                  ? { hint: t('features.readOnlyHint') }
                  : {})}
              />
            ))}
            {/*
              Mở thẳng tấm mua gói — người đọc danh sách này đang ở đúng màn đó rồi, một liên kết
              về chính nó là một cú chạm không đi tới đâu.
            */}
            <Button
              label={t('features.upgradeCta')}
              variant="secondary"
              size="sm"
              onPress={onUpgrade}
            />
          </YStack>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('features.allIncluded')}
          </Text>
        )}
      </YStack>
    </Card>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <Text
      col={colors.placeholder}
      fos={fontSize.meta}
      fow={fontWeight.semibold}
      letterSpacing={0.8}
    >
      {children.toLocaleUpperCase()}
    </Text>
  );
}

function FeatureRow({
  label,
  unlocked,
  hint,
}: {
  label: string;
  unlocked: boolean;
  hint?: string;
}) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons
        name={unlocked ? 'checkmark-circle' : 'lock-closed'}
        size={iconSize.sm}
        color={unlocked ? colors.success : colors.placeholder}
      />
      <Text f={1} col={unlocked ? colors.text : colors.textMuted} fos={fontSize.bodySm}>
        {label}
        {hint ? `${LIST_SEPARATOR}${hint}` : ''}
      </Text>
    </XStack>
  );
}
