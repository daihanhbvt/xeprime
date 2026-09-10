import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  isShopProfileSubmittable,
  PERMISSION,
  TENANT_STATUS,
  type TenantStatus,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { Href } from 'expo-router';

type StepKey = 'profile' | 'review' | 'vehicle';
type StepState = 'todo' | 'waiting' | 'done';

/** Đường kính đĩa của một bước — bằng đĩa đầu khối, để hai thẻ cạnh nhau cùng một nhịp. */
const STEP_DISC = 28;

/** Bề dày sợi nối hai bước. Mảnh hơn thì đứt quãng trên màn mật độ thấp, dày hơn thì thành cột. */
const RAIL_WIDTH = 2;

/**
 * Ba bước từ "vừa mở gian hàng" tới "bán được xe", đặt ở ĐẦU Tổng quan.
 *
 * Gian hàng mới tạo rơi vào một màn mà mọi ô đều là `0`/`—`: không xe, không đơn, không doanh
 * thu. Bảng số đó đúng nhưng vô dụng — nó không nói được việc gì tiếp theo, trong khi việc tiếp
 * theo có thật và rất cụ thể. Thẻ này nói ra ba việc đó rồi TỰ BIẾN MẤT khi gian hàng đã hoạt
 * động và có xe.
 *
 * Trạng thái từng bước đọc từ dữ liệu THẬT, không phải một cờ "đã xem hướng dẫn": hồ sơ đủ chưa
 * chấm bằng đúng quy tắc backend dùng để chặn gửi duyệt (`isShopProfileSubmittable`), nên bước 1
 * không bao giờ xanh trong khi nút Gửi duyệt vẫn bị từ chối.
 *
 * **Hình thức là một cái THANG DỌC**, không phải ba đoạn văn xếp chồng: ba việc này có THỨ TỰ —
 * hồ sơ xong mới gửi được duyệt, duyệt xong xe mới lên chợ. Sợi nối giữa hai đĩa là thứ nói ra
 * quan hệ đó, và nó đổi sang màu xanh ở phần đã đi qua nên nhìn một cái là biết còn mấy bước.
 */
export function ShopOnboardingCard({ vehicleCount }: { vehicleCount: number | undefined }) {
  const t = useTranslations('Dashboard.onboarding');
  const { tenant } = useTenantScope();
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canViewShop = has(PERMISSION.TENANT_VIEW);
  const status = tenant?.status as TenantStatus | undefined;
  const isActive = status === TENANT_STATUS.ACTIVE;
  const hasVehicle = (vehicleCount ?? 0) > 0;

  /*
   * Chỉ hỏi hồ sơ khi thẻ CÒN HIỆN và người xem có quyền — nhân viên không có `tenant.view` vẫn
   * thấy ba bước, chỉ là không chấm được bước hồ sơ.
   */
  /*
   * `vehicleCount === undefined` nghĩa là API đội xe CHƯA VỀ (hoặc người xem không có quyền
   * xem xe) — KHÔNG phải "chưa có xe nào". Coi hai chuyện đó là một khiến thẻ này bật lên ở
   * MỌI lần vào Tổng quan của một gian hàng đã active và có xe thật: đúng khoảng số liệu còn
   * rỗng thì `hasVehicle` tính ra `false`, thẻ hiện ra rồi biến mất ngay khi dữ liệu tới.
   *
   * Chỉ chặn bước xe khi ĐÃ BIẾT chắc là 0 (`vehicleCount !== undefined`). `!isActive` không
   * đợi gì cả — hồ sơ/duyệt không phụ thuộc API đội xe nên không có lý do trễ thẻ vì nó.
   */
  const needsCard =
    Boolean(tenant) && (!isActive || (vehicleCount !== undefined && !hasVehicle));
  const { data: shop } = useMyShop(needsCard && canViewShop);

  if (!needsCard) return null;

  const profileDone = shop
    ? isShopProfileSubmittable({
        displayName: shop.profile.displayName,
        // Tỉnh hiệu lực nằm ở chi nhánh mặc định; hai cột trên hồ sơ chỉ là bản sao.
        provinceCode: shop.defaultBranch?.provinceCode ?? shop.profile.provinceCode,
        ownerFullName: shop.profile.ownerFullName,
        ownerPhone: shop.profile.ownerPhone,
      })
    : false;

  const steps: { key: StepKey; state: StepState; href: Href }[] = [
    {
      key: 'profile',
      // Hồ sơ đã đi qua vòng duyệt thì không còn gì để "hoàn thiện" ở bước này nữa.
      state:
        profileDone || status === TENANT_STATUS.PENDING_REVIEW || isActive ? 'done' : 'todo',
      href: ROUTES.manage.shop(),
    },
    {
      key: 'review',
      state: isActive ? 'done' : status === TENANT_STATUS.PENDING_REVIEW ? 'waiting' : 'todo',
      href: ROUTES.manage.shop(),
    },
    {
      key: 'vehicle',
      state: hasVehicle ? 'done' : 'todo',
      href: ROUTES.manage.vehicleNew(),
    },
  ];

  return (
    <Card padded={false}>
      <XStack
        ai="center"
        gap={space.sm}
        px={space.md}
        py={space.md}
        bg={colors.primaryLight}
        borderBottomWidth={1}
        bc={colors.borderSubtle}
      >
        <IconDisc icon="rocket" tone={colors.primaryActive} size={STEP_DISC} filled />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('subtitle')}
          </Text>
        </YStack>
      </XStack>

      <YStack px={space.md} pt={space.md}>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;

          return (
            /*
              `ai="stretch"` là thứ cho cột trái cao bằng cả bước, để sợi nối `f={1}` biết mình
              phải kéo dài tới đâu. Bỏ nó thì sợi nối co về 0 và thang đứt thành ba đĩa rời.
            */
            <XStack key={step.key} gap={space.sm} ai="stretch">
              <YStack ai="center" w={STEP_DISC}>
                <StepDisc index={index} state={step.state} />
                {last ? null : (
                  <YStack
                    f={1}
                    w={RAIL_WIDTH}
                    my={space.xs}
                    br={radius.pill}
                    bg={step.state === 'done' ? colors.success : colors.border}
                  />
                )}
              </YStack>

              <YStack f={1} gap={space.xs} pb={space.md}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t(`steps.${step.key}.title` as 'steps.profile.title')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t(`steps.${step.key}.body` as 'steps.profile.body')}
                </Text>
                {step.state === 'done' ? (
                  <Text col={colors.success} fos={fontSize.label} fow={fontWeight.semibold}>
                    {t('done')}
                  </Text>
                ) : step.state === 'waiting' ? (
                  <Text col={colors.warning} fos={fontSize.label} fow={fontWeight.semibold}>
                    {t('waiting')}
                  </Text>
                ) : (
                  <XStack pt={space.xs}>
                    <Button
                      label={t(`steps.${step.key}.action` as 'steps.profile.action')}
                      variant="accent"
                      size="sm"
                      shape="square"
                      block={false}
                      onPress={() => navigateOnce(step.href)}
                    />
                  </XStack>
                )}
              </YStack>
            </XStack>
          );
        })}
      </YStack>
    </Card>
  );
}

/**
 * Đĩa của một bước: xong thì dấu tích xanh ĐẶC, đang chờ thì đồng hồ cam đặc, còn lại là SỐ THỨ
 * TỰ trên nền gold nhạt.
 *
 * Bước chưa làm giữ con số chứ không mượn một biểu tượng: cả thẻ nói về THỨ TỰ, và "1 · 2 · 3"
 * là cách nói thứ tự mà không cần chú giải. Đĩa xong/đang chờ thì ngược lại — ở đó con số hết
 * việc, cái cần đọc là kết quả.
 */
function StepDisc({ index, state }: { index: number; state: StepState }) {
  if (state === 'done') {
    return <IconDisc icon="checkmark" tone={colors.success} size={STEP_DISC} filled />;
  }
  if (state === 'waiting') {
    return <IconDisc icon="hourglass" tone={colors.warning} size={STEP_DISC} filled />;
  }

  return (
    <YStack
      w={STEP_DISC}
      h={STEP_DISC}
      br={radius.pill}
      bg={colors.primaryLight}
      bw={1}
      bc={colors.primary}
      ai="center"
      jc="center"
    >
      <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.bold}>
        {index + 1}
      </Text>
    </YStack>
  );
}
