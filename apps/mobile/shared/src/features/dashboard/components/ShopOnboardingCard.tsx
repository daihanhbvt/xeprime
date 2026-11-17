import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isShopProfileSubmittable, PERMISSION } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import CheckCircleFilled from '@ant-design/icons-svg/es/asn/CheckCircleFilled';
import { AntIcon } from '@/components/icons/AntIcon';
import ClockCircleOutlined from '@ant-design/icons-svg/es/asn/ClockCircleOutlined';
import type { IconName } from '@/components/ui/Chip';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, typeScale } from '@/theme/tokens';
import type { Href } from 'expo-router';

type StepKey = 'profile' | 'vehicle' | 'review';
type StepState = 'todo' | 'waiting' | 'done';

/**
 * Ba bước từ "vừa mở gian hàng" tới "bán được xe", đặt ở ĐẦU Tổng quan — bản native của web
 * `ShopOnboardingCard`.
 *
 * ## Bước 2 đổi nghĩa (ADR 0036)
 *
 * Bước giữa từng là "gửi hồ sơ gian hàng cho XePrime duyệt". Nền tảng không còn duyệt GIAN HÀNG —
 * vòng duyệt duy nhất là duyệt XE. Thứ tự nay là: hồ sơ → thêm xe → **chờ duyệt xe**, và mốc
 * biến mất của thẻ là `publicVehicleCount > 0` (xe đầu tiên đã lên chợ) — đúng mốc web dùng. Bản
 * cũ chờ `tenant.status = active` nên thẻ có thể kẹt ở bước "chờ duyệt" mãi.
 *
 * Gian hàng mới tạo rơi vào một màn mà mọi ô đều là `0`/`—`: không xe, không đơn, không doanh
 * thu. Bảng số đó đúng nhưng vô dụng — nó không nói được việc gì tiếp theo, trong khi việc tiếp
 * theo có thật và rất cụ thể. Thẻ này nói ra ba việc đó rồi TỰ BIẾN MẤT khi gian hàng đã hoạt
 * động và có xe.
 *
 * Trạng thái từng bước đọc từ dữ liệu THẬT, không phải một cờ "đã xem hướng dẫn": hồ sơ đủ chưa
 * chấm bằng đúng quy tắc backend dùng để chặn gửi duyệt (`isShopProfileSubmittable`), nên bước 1
 * không bao giờ xanh trong khi nút Gửi duyệt vẫn bị từ chối.
 */
export function ShopOnboardingCard({ vehicleCount }: { vehicleCount: number | undefined }) {
  const colors = useColors();
  const t = useTranslations('Dashboard.onboarding');
  const { tenant } = useTenantScope();
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canViewShop = has(PERMISSION.TENANT_VIEW);
  const hasVehicle = (vehicleCount ?? 0) > 0;
  const liveVehicle = (tenant?.publicVehicleCount ?? 0) > 0;

  /*
   * Chỉ hỏi hồ sơ khi thẻ CÒN HIỆN và người xem có quyền — nhân viên không có `tenant.view` vẫn
   * thấy ba bước, chỉ là không chấm được bước hồ sơ.
   */
  // Hiện cho tới khi chiếc xe ĐẦU TIÊN lên chợ — đúng web (`!liveVehicle`).
  const needsCard = Boolean(tenant) && !liveVehicle;
  const { data: shop } = useMyShop(needsCard && canViewShop);

  if (!needsCard) return null;

  const profileDone = shop
    ? isShopProfileSubmittable({
        displayName: shop.profile.displayName,
        // Tỉnh hiệu lực nằm ở chi nhánh mặc định; hai cột trên hồ sơ chỉ là bản sao.
        provinceCode: shop.defaultBranch?.provinceCode ?? shop.profile.provinceCode,
        // Chủ gian hàng đọc từ TÀI KHOẢN (16/09/2026) — ba cột `tenant_profiles.owner_*` đã
        // drop, và cổng gửi duyệt ở backend đọc đúng nguồn này.
        ownerFullName: shop.ownerAccount.displayName,
        ownerPhone: shop.ownerAccount.phone,
      })
    : false;

  const steps: { key: StepKey; state: StepState; href: Href | null }[] = [
    { key: 'profile', state: profileDone ? 'done' : 'todo', href: ROUTES.manage.shop() },
    { key: 'vehicle', state: hasVehicle ? 'done' : 'todo', href: ROUTES.manage.vehicleNew() },
    {
      /*
       * KHÔNG có nút gửi duyệt ở đây (web cũng không): nút đó nằm trên chính chiếc xe, nơi có
       * checklist xe còn thiếu gì. Có xe rồi thì lối đi là danh sách xe; chưa có thì chưa có gì.
       */
      key: 'review',
      state: liveVehicle ? 'done' : hasVehicle ? 'waiting' : 'todo',
      href: hasVehicle ? ROUTES.manage.vehicles() : null,
    },
  ];

  /*
   * Web `ShopOnboardingCard.module.css` khổ ≤640: thẻ đệm 12, viền `border-subtle`, bo 10, KHÔNG
   * bóng; mỗi bước là một HÀNG CÓ VIỀN (bước xong: nền xám, không viền), nút của bước xuống dòng,
   * rộng hết khổ, thụt bằng dấu thứ tự + khoảng cách.
   */
  return (
    <InfoGroupCard title={t('title')}>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t('subtitle')}
        </Text>

        <YStack gap={STEPS_GAP}>
          {steps.map((step, index) => {
            const done = step.state === 'done';
            return (
              <YStack
                key={step.key}
                gap={STEP_GAP}
                px={STEP_PAD_X}
                py={STEP_PAD_Y}
                bw={1}
                bc={done ? 'transparent' : colors.borderSubtle}
                bg={done ? colors.borderSubtle : 'transparent'}
                br={radius.md}
              >
                <XStack ai="center" gap={STEP_GAP}>
                  <StepMarker index={index} done={done} />
                  <YStack f={1} minWidth={0} gap={1}>
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                      {t(`steps.${step.key}.title` as 'steps.profile.title')}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t(`steps.${step.key}.body` as 'steps.profile.body')}
                    </Text>
                  </YStack>
                  {done ? (
                    <Text col={colors.success} fos={fontSize.bodySm}>
                      {t('done')}
                    </Text>
                  ) : step.state === 'waiting' ? (
                    <XStack ai="center" gap={WAITING_GAP}>
                      <AntIcon icon={ClockCircleOutlined} size={iconSize.xs} color={colors.textMuted} />
                      <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                        {t('waiting')}
                      </Text>
                    </XStack>
                  ) : null}
                </XStack>
                {!done && step.state !== 'waiting' && step.href ? (
                  <YStack paddingLeft={MARKER + STEP_GAP}>
                    <Button
                      label={t(`steps.${step.key}.action` as 'steps.profile.action')}
                      icon={STEP_ICON[step.key]}
                      onPress={() => step.href && navigateOnce(step.href)}
                    />
                  </YStack>
                ) : null}
              </YStack>
            );
          })}
        </YStack>
    </InfoGroupCard>
  );
}

/** Web khổ ≤640: `.card` đệm/khoảng `--xp-space-md` = 12; `.steps` cách `--xp-space-sm` = 8. */
const STEPS_GAP = 8;
/** `.step { padding: var(--xp-space-sm) var(--xp-space-md); gap: var(--xp-space-md) }` = 8/12, 12. */
const STEP_PAD_Y = 8;
const STEP_PAD_X = 12;
const STEP_GAP = 12;
/** `.marker` 26, `.markerDone` 18, `.waitingLabel { gap: 6px }`. */
const MARKER = 26;
const MARKER_DONE = 18;
const WAITING_GAP = 6;

/** Icon nút hành động của từng bước - web `STEP_ICON` (Solution · Car · Send, qua lớp ghép icon). */
const STEP_ICON: Record<StepKey, IconName> = {
  profile: 'reader-outline',
  vehicle: 'car-outline',
  review: 'send-outline',
};

/** Dấu thứ tự - web `.marker`: tròn 26 nền `primary-light`, số 12 đậm vừa màu `primary`; xong = tích xanh 18. */
function StepMarker({ index, done }: { index: number; done: boolean }) {
  const colors = useColors();
  return (
    <YStack w={MARKER} h={MARKER} br={radius.pill} bg={colors.primaryLight} ai="center" jc="center">
      {done ? (
        <AntIcon icon={CheckCircleFilled} size={MARKER_DONE} color={colors.success} />
      ) : (
        <Text col={colors.primary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {index + 1}
        </Text>
      )}
    </YStack>
  );
}
