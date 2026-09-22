import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  isFeatureVisible,
  type PlanFeature,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { IconDisc } from '@/components/ui/IconDisc';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Biểu tượng của từng năng lực — mỗi ô một hình, không phải chín ổ khoá giống hệt nhau.
 *
 * Chín ô cùng một icon thì icon không còn nói gì và mắt phải đọc hết chín dòng chữ để phân biệt.
 * Bảng khai đủ MỌI cờ trong `PLAN_FEATURE` nên thêm một cờ mới mà quên icon là lỗi biên dịch,
 * không phải một ô trống trên giao diện.
 */
const FEATURE_ICON: Readonly<Record<PlanFeature, IconName>> = {
  [PLAN_FEATURE.FINANCE]: 'stats-chart-outline',
  [PLAN_FEATURE.DEBTS]: 'receipt-outline',
  [PLAN_FEATURE.MAINTENANCE]: 'construct-outline',
  [PLAN_FEATURE.MEMBERS]: 'people-outline',
  [PLAN_FEATURE.BRANCHES]: 'git-branch-outline',
  [PLAN_FEATURE.DRIVERS]: 'id-card-outline',
  [PLAN_FEATURE.CONTRACTS]: 'document-text-outline',
  [PLAN_FEATURE.ESCROW_HOLD]: 'shield-checkmark-outline',
};

/**
 * Số ô NĂNG LỰC in ra, chưa kể ô "không giới hạn xe" mở đầu và ô "còn nữa" khép lại.
 *
 * Năm để tổng đúng BẢY — trên màn hẹp lưới là MỘT cột, nên bảy dòng đã là hết chỗ dễ đọc trước
 * khi người ta bỏ cuộn. Cờ thứ sáu trở đi không bị giấu: ô cuối nói thẳng là còn nữa, và bảng
 * giá liệt kê đủ.
 */
const FEATURE_TILES = 5;

/**
 * "NÂNG CẤP ĐỂ MỞ KHOÁ" — ADR 0027 §Hệ quả gọi đây là **chỗ bán hàng thật sự** của màn "Gói của
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
 * `shop_manager` xem được hạn mức nhưng không mua được), HOẶC luồng nâng cấp đã dựng sẵn ngay
 * bên dưới. Khi đó vẫn liệt kê tính năng còn khoá (họ cần biết vì sao một mục menu vắng), nhưng
 * KHÔNG mời họ chạm vào một luồng API sẽ chặn — hay vào một cú chạm chỉ để cuộn xuống vài trăm px.
 *
 * ## Hai mục KHÔNG phải cờ tính năng
 *
 * "Không giới hạn số xe (tuỳ gói)" đứng đầu vì nó là lý do đổi tuyến rõ nhất, nhưng nó là HẠN
 * MỨC (`limits.maxVehicles`), không phải một cờ trong `PLAN_FEATURE`. "Nhiều tính năng khác…"
 * đứng cuối vì danh sách cờ có thể dài ra mà chỗ thì có hạn — nói thẳng là còn nữa, đúng hơn là
 * im lặng cắt.
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
    /*
      MỘT thẻ, như mọi khối khác của màn gói.

      Bản trước để khối này trôi trần giữa hai thẻ trắng: nó là chỗ BÁN HÀNG thật sự của màn
      (ADR 0027 §Hệ quả), mà một dải ô xám không viền đọc ra như phần đuôi của thẻ phía trên chứ
      không phải một khối có chủ đề riêng.

      Đĩa hình qua `IconDisc` chứ không phải một ô bo góc dựng tay: mọi huy hiệu tròn trong app
      đi qua một chỗ, nếu không thì mỗi màn một đường kính và một tỉ lệ glyph.
    */
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <IconDisc icon="ribbon" tone={colors.primary} filled />
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
              {t('features.unlockTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('features.unlockSubtitle')}
            </Text>
          </YStack>
        </XStack>

        <YStack gap={space.xs}>
          <FeatureTile icon="car-outline" label={t('features.unlockVehicles')} />
          {locked.slice(0, FEATURE_TILES).map((feature) => (
            <FeatureTile
              key={feature}
              icon={FEATURE_ICON[feature]}
              label={
                domainLabel('planFeature', feature) +
                /* `read_only` = đã có dữ liệu từ kỳ trước; nói ra để không ai tưởng đã mất sổ. */
                (isFeatureVisible(states[feature] ?? FEATURE_STATE.ENABLED)
                  ? `${LIST_SEPARATOR}${t('features.readOnlyHint')}`
                  : '')
              }
            />
          ))}
          <FeatureTile icon="ellipsis-horizontal" label={t('features.unlockMore')} muted />
        </YStack>

        {/*
          Mở thẳng tấm mua gói — người đọc danh sách này đang ở đúng màn đó rồi, một liên kết về
          chính nó là một cú chạm không đi tới đâu.
        */}
        {onUpgrade ? (
          <Button
            label={t('features.upgradeCta')}
            variant="accent"
            size="sm"
            icon="arrow-up-circle-outline"
            onPress={onUpgrade}
          />
        ) : null}
      </YStack>
    </Card>
  );
}

/** Một ô năng lực: biểu tượng riêng + nhãn bằng ngôn ngữ người dùng. */
function FeatureTile({
  icon,
  label,
  muted = false,
}: {
  icon: IconName;
  label: string;
  muted?: boolean;
}) {
  return (
    <XStack ai="center" gap={space.sm} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
      <Ionicons
        name={icon}
        size={iconSize.sm}
        color={muted ? colors.placeholder : colors.primaryActive}
        accessibilityElementsHidden
      />
      <Text f={1} col={muted ? colors.placeholder : colors.text} fos={fontSize.bodySm}>
        {label}
      </Text>
    </XStack>
  );
}
