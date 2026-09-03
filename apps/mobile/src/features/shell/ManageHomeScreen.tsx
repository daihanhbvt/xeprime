import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_STATUS } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { ManageHeader } from './ManageHeader';

/**
 * Màn đầu của khu quản lý.
 *
 * Gian hàng chưa `active` vẫn VÀO ĐƯỢC — chặn ở cửa là giấu mất chính cái màn giải thích vì
 * sao họ bị chặn (doc 15 §4.4). Cái đổi theo trạng thái là nội dung khối trên cùng, không phải
 * quyền vào.
 *
 * Lối tắt ẩn theo quyền chứ không disable: một nút xám không nói được vì sao nó xám.
 */
export function ManageHomeScreen() {
  const t = useTranslations('MobileShell.manageHome');
  const { tenant } = useTenantScope();
  const domainLabel = useDomainLabel();

  /*
   * Kéo-làm-mới ở đây đọc lại HỒ SƠ PHIÊN, không phải một danh sách: trạng thái gian hàng và
   * quyền đều đến từ `/auth/me`. Chủ shop vừa gia hạn gói, hay vừa bị gỡ khỏi gian hàng — đó là
   * những thứ màn này hiển thị, và không có lối làm mới thì phải đóng app mở lại mới thấy.
   */
  const session = useCurrentUser();

  const status = tenant?.status;
  const notice =
    status === TENANT_STATUS.EXPIRED
      ? { icon: 'time-outline' as const, title: t('expiredTitle'), body: t('expiredBody') }
      : status && status !== TENANT_STATUS.ACTIVE
        ? {
            icon: 'information-circle-outline' as const,
            title: t('inactiveTitle'),
            body: t('inactiveBody'),
          }
        : null;

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={session.isRefetching}
        onRefresh={() => void session.refetch()}
      >
        <YStack gap={layout.section}>
          <YStack gap={layout.inline}>
            <SectionTitle>{t('shopStatus')}</SectionTitle>
            {status ? (
              <XStack>
                <Chip label={domainLabel('tenantStatus', status)} icon="storefront-outline" />
              </XStack>
            ) : null}
            {notice ? (
              <Card tone="muted" lift="flat">
                <XStack gap={space.sm}>
                  <Ionicons name={notice.icon} size={iconSize.lg} color={colors.warning} />
                  <YStack f={1} gap={space.xs}>
                    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                      {notice.title}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {notice.body}
                    </Text>
                  </YStack>
                </XStack>
              </Card>
            ) : null}
          </YStack>

          {/*
            PHASE 1: khối lối tắt tạm rỗng.

            Ba lối tắt (hộp thư yêu cầu · đơn thuê · tạo đơn) đi cùng chính các màn đó ở phase 2.
            Dựng nút trước màn là dẫn người dùng tới một route không tồn tại — tệ hơn hẳn so với
            việc chưa có nút. Khoá `quickActions`/`openRequests`/`openBookings`/`newBooking` giữ
            nguyên trong bộ dịch, gắn lại đúng chỗ này khi màn về.
          */}
        </YStack>
      </Screen>
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
      {children}
    </Text>
  );
}
