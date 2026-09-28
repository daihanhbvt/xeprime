import { Ionicons } from '@expo/vector-icons';
import { STATUS_COLOR } from '@xeprime/types';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { Chip } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/DataRow';
import { IconDisc } from '@/components/ui/IconDisc';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PlanPurchaseState, PlanTermChoice, PlanTier } from '../plan-purchase';

/**
 * Số dòng năng lực in trên MỘT thẻ bậc.
 *
 * Hai, cùng con số web dùng: thẻ bậc là để SO SÁNH, và một danh sách tám dòng trên mỗi thẻ
 * biến ba thẻ thành ba màn cuộn — lúc đó không còn gì để so.
 */
const FEATURE_LINES = 2;

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
 * ## Kỳ hạn hỏi trong một TẤM TRƯỢT, không nối thêm vào trang
 *
 * Vẽ cả bốn kỳ hạn trên cả ba thẻ là mười hai con số cho một quyết định hai bước. Thẻ hiện giá
 * THÁNG (mốc rẻ nhất để so ngang các bậc); chạm chọn một bậc thì kỳ hạn của CHÍNH bậc đó trượt
 * lên, nơi % tiết kiệm có nghĩa vì nó so với giá tháng của bậc ấy.
 *
 * Trước đợt này bảng kỳ hạn nối thẳng dưới ba thẻ bậc. Hai vấn đề, và cả hai chỉ lộ ra trên màn
 * hẹp: nó mọc ra sau một cú chạm ở TRÊN nó nên đẩy mọi thứ xuống và người dùng mất chỗ đang
 * nhìn; và ở màn "Mua / gia hạn gói" — vốn đã là một tấm trượt — nó biến nội dung tấm đó thành
 * hai màn cuộn, với nút chốt đơn nằm tít dưới cùng.
 *
 * Tấm trượt giải quyết cả hai: trang đứng yên, và câu hỏi "kỳ hạn nào" chiếm trọn sự chú ý đúng
 * lúc nó được hỏi. Chọn xong thì tấm đóng lại — một bước, một quyết định.
 *
 * Lồng tấm trượt trong tấm trượt là mẫu đã chạy sẵn ở đây (`EditBookingSheet` chứa
 * `SelectField`, và ô đó tự mở tấm của nó).
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
  /**
   * Tấm chọn kỳ hạn đang mở hay không.
   *
   * KHÔNG suy từ `selected != null`: bậc vẫn đang chọn sau khi tấm đóng, nên một tấm mở theo
   * điều kiện đó sẽ bật lại ngay mỗi lần component render. Đây là ý định của NGƯỜI DÙNG, nên
   * nó phải là state riêng.
   */
  const [termsOpen, setTermsOpen] = useState(false);
  /**
   * Kỳ hạn ĐÃ CHỌN của bậc đang chọn.
   *
   * Từ lúc bảng kỳ hạn dời vào tấm trượt, trang không còn chỗ nào nói người dùng đã chọn kỳ
   * nào — tấm đóng lại là lựa chọn biến mất khỏi tầm mắt. Thẻ bậc phải tự mang nó.
   */
  const chosenTerm = selected?.terms.find((choice) => choice.months === termMonths) ?? null;

  /*
   * Chạm một bậc = chọn bậc VÀ hỏi kỳ hạn. Chạm lại đúng bậc đang chọn thì mở lại tấm — đó là
   * đường DUY NHẤT để đổi kỳ hạn sau khi đã chọn, vì bảng kỳ hạn không còn nằm trên trang.
   */
  const pickTier = (id: string) => {
    state.selectPlan(id);
    setTermsOpen(true);
  };

  return (
    <YStack gap={space.sm}>
      <YStack gap={space.sm} accessibilityRole="radiogroup" accessibilityLabel={t('planLabel')}>
        {tiers.map((tier) => (
          <TierCard
            key={tier.plan.id}
            tier={tier}
            active={tier.plan.id === planId}
            {...(tier.plan.id === planId && chosenTerm ? { chosenTerm } : {})}
            onSelect={() => pickTier(tier.plan.id)}
            onContact={() => navigateOnce(ROUTES.support.home())}
          />
        ))}
      </YStack>

      {/*
        Tấm chỉ dựng khi có bậc TỰ MUA đang chọn: bậc tư vấn không có kỳ hạn để hỏi, và một tấm
        rỗng trượt lên là một câu hỏi không có câu trả lời nào.
      */}
      {selected?.selfServe ? (
        <BottomSheet
          open={termsOpen}
          onClose={() => setTermsOpen(false)}
          title={t('termsTitleFor', { plan: selected.plan.name })}
          subtitle={t('termsHint')}
        >
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
                  /*
                   * Chọn xong là ĐÓNG. Một tấm nằm lại sau khi đã trả lời xong câu hỏi bắt người
                   * dùng tự tìm đường thoát, và che mất chính con số tổng mà họ vừa đổi.
                   */
                  onPress={() => {
                    state.setTermMonths(choice.months);
                    setTermsOpen(false);
                  }}
                >
                  {/* Vòng tròn chọn là HÌNH ẢNH của `accessibilityState` ngay trên hàng này. */}
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={iconSize.md}
                    color={active ? colors.primary : colors.placeholder}
                    accessibilityElementsHidden
                  />
                  <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('termOption', { months: choice.months })}
                  </Text>
                  {/*
                    % tiết kiệm là một phép SO SÁNH với giá tháng của chính bậc này, không phải
                    một khoản giảm trên hoá đơn (ADR 0041 điều 2). Bậc không bán kỳ 1 tháng thì
                    không có mốc để so và nhãn vắng mặt — im lặng đúng hơn một con số không kiểm
                    chứng được.
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
        </BottomSheet>
      ) : null}
    </YStack>
  );
}

/** Một BẬC: tên, hai dòng hạn mức, giá tháng (hoặc lời mời liên hệ), và nút chọn. */
function TierCard({
  tier,
  active,
  chosenTerm,
  onSelect,
  onContact,
}: {
  tier: PlanTier;
  active: boolean;
  /** Kỳ hạn người dùng đã chốt cho CHÍNH bậc này — vắng mặt khi họ mới chọn bậc mà chưa chọn kỳ. */
  chosenTerm?: PlanTermChoice;
  onSelect: () => void;
  onContact: () => void;
}) {
  const t = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  /* Mốc rẻ nhất để so ngang ba bậc — bậc không bán kỳ 1 tháng thì lấy kỳ ngắn nhất nó có. */
  const monthly = tier.terms.find((term) => term.months === 1) ?? tier.terms[0];
  const leadColor = active
    ? STATUS_COLOR.SUCCESS
    : tier.limits.recommended
      ? STATUS_COLOR.WARNING
      : STATUS_COLOR.NEUTRAL;

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={leadColor} />
        <YStack f={1} p={space.md} gap={space.sm}>
          <XStack ai="center" gap={space.sm}>
            <IconDisc
              icon={tier.selfServe ? 'ribbon-outline' : 'business-outline'}
              tone={active ? colors.primary : colors.primaryActive}
              surface={colors.primaryLight}
              filled={active}
            />
            <Text
              f={1}
              minWidth={0}
              col={colors.text}
              fos={fontSize.bodyLg}
              fow={fontWeight.bold}
              numberOfLines={2}
            >
              {tier.plan.name}
            </Text>
            {/*
              Hàng tiêu đề đúng như web: tên bậc + viên "Được đề xuất" KHI VÀ CHỈ KHI
              `limits.recommended` — kể cả lúc bậc đó đang được chọn (trạng thái chọn đã nằm ở nút
              "Đã chọn" bên dưới). Không có nhãn "gói dịch vụ" phía trên tên, không có viên
              "Doanh nghiệp" cho bậc tư vấn: web không dựng chúng, và ô giá "Liên hệ" đã nói ra
              điểm khác của bậc đó.
            */}
            {tier.limits.recommended ? (
              <StatusBadge label={t('recommendedTag')} color={STATUS_COLOR.WARNING} size="sm" />
            ) : null}
          </XStack>

          {tier.plan.description ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {tier.plan.description}
            </Text>
          ) : null}

          <Divider />

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
            {/*
            Hai NĂNG LỰC đầu của bậc, viết bằng ngôn ngữ người dùng (`Domain.planFeature`) — hạn mức
            nói được "bao nhiêu xe" nhưng không nói được "rồi làm gì với chúng". Dừng ở hai để
            ba thẻ bậc còn so ngang được trong một tầm mắt; danh sách đủ nằm ở khối "mở khoá".
          */}
            {tier.limits.features.slice(0, FEATURE_LINES).map((feature) => (
              <LimitLine key={feature} text={domainLabel('planFeature', feature)} />
            ))}
          </YStack>

          {tier.selfServe && monthly ? (
            <XStack ai="baseline" gap={space.xs}>
              <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                {fmt.money(String(monthly.total))}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {/* Kỳ 1 tháng đọc là "/ tháng" — "/1 tháng" là một con số không ai cần đọc. */}
                {monthly.months === 1 ? t('perMonth') : t('perTerm', { months: monthly.months })}
              </Text>
            </XStack>
          ) : (
            <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('contactForQuote')}
            </Text>
          )}

          {/*
          Bậc ĐANG CHỌN đi nút chính kèm dấu tích; bậc còn lại là vàng nhạt — vẫn mời chạm,
          nhưng không tranh chấp với bậc đã chọn.
        */}
          {/*
          Kỳ hạn đã chốt, nói bằng CHỮ ngay trên thẻ: giá tháng phía trên là mốc so sánh giữa
          các bậc, còn đây mới là thứ người dùng sắp trả. Thiếu dòng này thì sau khi tấm trượt
          đóng, lựa chọn của họ chỉ còn tồn tại trong một con số tổng ở tận cuối màn.
        */}
          {chosenTerm ? (
            <XStack
              ai="center"
              gap={space.xs}
              pt={space.xs}
              borderTopWidth={1}
              borderColor={colors.borderSubtle}
            >
              <Ionicons
                name="calendar-clear"
                size={iconSize.sm}
                color={colors.primaryActive}
                accessibilityElementsHidden
              />
              <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('termOption', { months: chosenTerm.months })}
              </Text>
              <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.bold}>
                {fmt.money(String(chosenTerm.total))}
              </Text>
            </XStack>
          ) : null}

          {tier.selfServe ? (
            <Button
              label={active ? t('tierSelected') : t('tierSelect')}
              variant={active ? 'primary' : 'accent'}
              size="sm"
              {...(active ? { icon: 'checkmark-circle-outline' as const } : {})}
              onPress={onSelect}
            />
          ) : (
            <Button
              label={t('contactSales')}
              variant="accent"
              size="sm"
              icon="headset-outline"
              onPress={onContact}
            />
          )}
        </YStack>
      </XStack>
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
