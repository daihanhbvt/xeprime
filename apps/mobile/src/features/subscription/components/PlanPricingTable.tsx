import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PlanPurchaseState, PlanTier } from '../plan-purchase';

/**
 * BẢNG GIÁ ba bậc — phần vẽ của bộ chọn mua gói (ADR 0041). Bản native của `PlanPricingTable`.
 *
 * Dùng CHUNG cho `PurchaseSheet` (gia hạn / nâng bậc) và bước 2 của onboarding gian hàng trả phí.
 * Không giữ state và không biết gì về tiền: cả hai nằm ở `usePlanPurchase`, và nơi gọi sở hữu hook
 * đó vì chính nó cần `selection` để bật/khoá nút "Tạo hoá đơn" của mình.
 *
 * ## Bậc TƯ VẤN vẫn có thẻ
 *
 * Bậc `salesOnly` không mua được, nhưng thẻ của nó ở lại (ADR 0041 điều 5): giấu bậc doanh nghiệp
 * là giấu lối nâng cấp của chính nhóm khách hàng lớn nhất, và một bảng giá dừng ở "10 xe" nói rằng
 * nền tảng không phục vụ được đội xe lớn hơn. Chỗ của giá là một dòng "Liên hệ báo giá" + nút liên
 * hệ — không phải một con số, vì chưa có con số nào.
 *
 * ## Kỳ hạn chỉ mở ra ở bậc ĐANG CHỌN
 *
 * Vẽ cả bốn kỳ hạn trên cả ba thẻ là mười hai con số cho một quyết định hai bước — và trên màn hẹp
 * thì đó là hai màn cuộn. Thẻ hiện giá THÁNG (mốc rẻ nhất để so ngang các bậc); chọn bậc rồi mới
 * tới bảng kỳ hạn bên dưới, nơi % tiết kiệm có nghĩa vì nó so với chính giá tháng của bậc đó.
 *
 * Bậc tư vấn dẫn tới TRUNG TÂM HỖ TRỢ công khai — cùng đích với web (`/support`). Không dựng một
 * biểu mẫu "để lại thông tin" riêng: kênh liên hệ thật đã sống ở một chỗ có tên, và một biểu mẫu
 * thứ hai là một hàng đợi thứ hai mà chưa ai nhận.
 */
export function PlanPricingTable({ state }: { state: PlanPurchaseState }) {
  const t = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const { tiers, planId, selected, termMonths } = state;

  return (
    <YStack gap={space.md}>
      <YStack gap={space.sm} accessibilityRole="radiogroup" accessibilityLabel={t('planLabel')}>
        {tiers.map((tier) => (
          <TierCard
            key={tier.plan.id}
            tier={tier}
            active={tier.plan.id === planId}
            onSelect={() => state.selectPlan(tier.plan.id)}
            onContact={() => navigateOnce(ROUTES.support.home())}
          />
        ))}
      </YStack>

      {selected?.selfServe ? (
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('termsTitleFor', { plan: selected.plan.name })}
          </Text>

          <YStack
            gap={space.xs}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('termsTitle')}
          >
            {selected.terms.map((choice) => {
              const active = termMonths === choice.months;
              return (
                <XStack
                  key={choice.months}
                  ai="center"
                  gap={space.sm}
                  p={space.md}
                  br={radius.md}
                  bw={1}
                  bc={active ? colors.primary : colors.borderSubtle}
                  bg={active ? colors.primaryLight : colors.surface}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={t('termOption', { months: choice.months })}
                  onPress={() => state.setTermMonths(choice.months)}
                >
                  <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('termOption', { months: choice.months })}
                  </Text>
                  {/*
                    % tiết kiệm là một phép SO SÁNH với giá tháng của chính bậc này, không phải một
                    khoản giảm trên hoá đơn (ADR 0041 điều 2). Bậc không bán kỳ 1 tháng thì không có
                    mốc để so và nhãn vắng mặt — im lặng đúng hơn một con số không kiểm chứng được.
                  */}
                  {choice.savingPercent > 0 ? (
                    <Chip label={t('termSaving', { percent: choice.savingPercent })} size="sm" />
                  ) : null}
                  <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.bold}>
                    {fmt.money(String(choice.total))}
                  </Text>
                </XStack>
              );
            })}
          </YStack>

          {/*
            Tổng tiền là CHỮ, không chỉ một con số to: khi chưa chọn kỳ hạn nó phải nói ra điều đó
            ("Chọn kỳ hạn"), không im lặng. Vùng sống để trình đọc màn hình nghe được con số mới —
            nó đổi do một cú chạm ở chỗ khác trên màn.
          */}
          <Text
            col={state.total == null ? colors.textMuted : colors.text}
            fos={fontSize.bodySm}
            fow={state.total == null ? fontWeight.regular : fontWeight.semibold}
            accessibilityLiveRegion="polite"
          >
            {state.total == null
              ? t('pickTerm')
              : t('total', { amount: fmt.money(String(state.total)) })}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Một BẬC: tên, hai dòng hạn mức, giá tháng (hoặc lời mời liên hệ), và nút chọn. */
function TierCard({
  tier,
  active,
  onSelect,
  onContact,
}: {
  tier: PlanTier;
  active: boolean;
  onSelect: () => void;
  onContact: () => void;
}) {
  const t = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();

  /* Mốc rẻ nhất để so ngang ba bậc — bậc không bán kỳ 1 tháng thì lấy kỳ ngắn nhất nó có. */
  const monthly = tier.terms.find((term) => term.months === 1) ?? tier.terms[0];

  return (
    <Card tone={active ? 'accent' : 'surface'}>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.xs} flexWrap="wrap">
          <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {tier.plan.name}
          </Text>
          {tier.limits.recommended ? <Chip label={t('recommendedTag')} size="sm" /> : null}
          {tier.selfServe ? null : <Chip label={t('enterpriseTag')} size="sm" />}
        </XStack>

        {tier.plan.description ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {tier.plan.description}
          </Text>
        ) : null}

        <YStack gap={space.xs}>
          <LimitLine
            text={
              tier.limits.maxVehicles == null
                ? t('limitVehiclesUnlimited')
                : t('limitVehicles', { count: tier.limits.maxVehicles })
            }
          />
          <LimitLine
            text={
              tier.limits.maxBranches == null
                ? t('limitBranchesUnlimited')
                : t('limitBranches', { count: tier.limits.maxBranches })
            }
          />
        </YStack>

        {tier.selfServe && monthly ? (
          <XStack ai="baseline" gap={space.xs}>
            <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
              {fmt.money(String(monthly.total))}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('perTerm', { months: monthly.months })}
            </Text>
          </XStack>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('contactForQuote')}
          </Text>
        )}

        {tier.selfServe ? (
          <Button
            label={active ? t('tierSelected') : t('tierSelect')}
            variant={active ? 'primary' : 'secondary'}
            size="sm"
            onPress={onSelect}
          />
        ) : (
          <Button
            label={t('contactSales')}
            variant="secondary"
            size="sm"
            icon="headset-outline"
            onPress={onContact}
          />
        )}
      </YStack>
    </Card>
  );
}

function LimitLine({ text }: { text: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
        {text}
      </Text>
    </XStack>
  );
}
