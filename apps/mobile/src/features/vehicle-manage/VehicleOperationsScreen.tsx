import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, SERVICE_TYPE, STATUS_COLOR } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import type { IconName } from '@/components/ui/Chip';
import { IconDisc } from '@/components/ui/IconDisc';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import { AutoAcceptBody } from './VehicleAutoAcceptScreen';
import { HandoverBody } from './VehicleHandoverTimeScreen';
import { SurchargesBody } from './VehicleSurchargesScreen';
import { TermsBody } from './VehicleTermsScreen';

/**
 * VẬN HÀNH & ĐIỀU KIỆN THUÊ — mục thứ bảy của hub sửa xe, bản native của
 * `VehicleOperationsPanel` (tab `operations` của `/manage/vehicles/:id/edit` bên web).
 *
 * ## Vì sao màn này phải tồn tại
 *
 * Bốn khối bên trong đã có từ lâu ở app, nhưng CHỈ dưới khu tài khoản
 * (`/account/vehicles/[id]/manage/...`) — tức chỉ chủ xe tuyến hoa hồng vào được. Gian hàng trả
 * phí quản xe ở `/manage/vehicles`, và ở đó không có đường nào tới khung giờ giao nhận, điều
 * khoản thuê hay phụ phí tài xế. Họ không đặt được giờ giao xe cho chính xe của mình.
 *
 * Đúng như web: MỘT mã nguồn cho hai tuyến (ADR 0027/0028). Màn này KHÔNG dựng form mới — nó gọi
 * lại đúng bốn thân form mà khu tài khoản đang dùng, nên hai bề mặt không thể trôi khỏi nhau.
 *
 * ## Vì sao gộp bốn khối vào một màn thay vì bốn route
 *
 * Cùng lý do web gom chúng vào một tab có `Collapse`: gian hàng có nhiều xe, và bắt người trực đi
 * bốn màn để chỉnh một chiếc là ba bước thừa. Khu tài khoản vẫn giữ bốn route riêng — ở đó mỗi
 * người chỉ có một, hai chiếc xe và một mục lục phẳng đọc dễ hơn.
 */
export function VehicleOperationsScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage.operationsTab');
  const tCommon = useTranslations('VehicleManage.common');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  const query = useVehicle(vehicleId, canView);

  const header = (
    <AppHeader
      title={t('title')}
      {...(query.data
        ? {
            subtitle: [query.data.name, query.data.plateNumber]
              .filter(Boolean)
              .join(LIST_SEPARATOR),
          }
        : {})}
      onBack={back}
    />
  );

  if (!permissionsLoading && !canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('title')} />
        </Screen>
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={8} />
        </Screen>
      </>
    );
  }

  if (query.isError || !query.data) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={tCommon('loadError')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  const services = query.data.serviceTypes ?? [];
  const selfDrive = services.includes(SERVICE_TYPE.SELF_DRIVE);
  const withDriver = services.includes(SERVICE_TYPE.WITH_DRIVER);

  return (
    <>
      {header}
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <YStack gap={layout.section}>
          {/* Đúng một đoạn `hint` như web — không tiêu đề phụ, không thẻ riêng. */}
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('hint')}
          </Text>

          {/*
            Ba nhóm, đúng thứ tự và đúng nhãn của `Collapse` bên web — và "Thời gian giao nhận" mở
            sẵn, đúng `defaultActiveKey={['handover']}`. Nó là khối áp dụng cho MỌI xe; hai khối
            còn lại chỉ có nghĩa với dịch vụ chiếc xe đang đăng.
          */}
          <Group label={t('handover')} icon="time-outline" defaultOpen>
            <HandoverBody vehicleId={vehicleId} canEdit={canEdit} />
          </Group>

          <Group label={t('selfDrive')} icon="car-sport-outline">
            {selfDrive ? (
              <YStack gap={layout.section}>
                <AutoAcceptBody
                  vehicleId={vehicleId}
                  serviceType={SERVICE_TYPE.SELF_DRIVE}
                  canEdit={canEdit}
                />
                <TermsBody
                  vehicleId={vehicleId}
                  serviceType={SERVICE_TYPE.SELF_DRIVE}
                  canEdit={canEdit}
                />
              </YStack>
            ) : (
              <ServiceOff label={t('serviceOff')} />
            )}
          </Group>

          <Group label={t('withDriver')} icon="person-outline">
            {withDriver ? (
              <YStack gap={layout.section}>
                <AutoAcceptBody
                  vehicleId={vehicleId}
                  serviceType={SERVICE_TYPE.WITH_DRIVER}
                  canEdit={canEdit}
                />
                <SurchargesBody vehicleId={vehicleId} canEdit={canEdit} />
                <TermsBody
                  vehicleId={vehicleId}
                  serviceType={SERVICE_TYPE.WITH_DRIVER}
                  canEdit={canEdit}
                />
              </YStack>
            ) : (
              <ServiceOff label={t('serviceOff')} />
            )}
          </Group>
        </YStack>
      </Screen>
    </>
  );
}

/**
 * Một nhóm gập được — bản native của một mục `Collapse` bên web: tiêu đề + mũi tên, không gì hơn.
 *
 * Gập KHÔNG phải trang trí ở đây: ba nhóm trải hết ra là gần hai chục ô nhập trên một màn điện
 * thoại, và người vào để sửa đúng một thứ phải cuộn qua tất cả.
 *
 * Nội dung gắn vào cây ở lần MỞ ĐẦU TIÊN (bốn thân form bên trong tự bắn truy vấn của nó — dựng
 * sẵn cả ba nhóm là ba lượt tải cho hai nhóm chưa ai nhìn), rồi ở LẠI khi gập: đúng hành vi mặc
 * định của `Collapse` (AntD giữ panel đã mở). Tháo nó khỏi cây lúc gập là vứt mất thứ người dùng
 * đang gõ dở mà chưa bấm Lưu.
 *
 * Không có viên "Đang mở"/"Chưa bật" hay mép màu theo dịch vụ: web không có tín hiệu nào như vậy ở
 * tiêu đề nhóm — xe không đăng dịch vụ thì câu `serviceOff` nằm BÊN TRONG nhóm, đúng như web.
 */
function Group({
  label,
  icon,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: IconName;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  const toggle = () => {
    setMounted(true);
    setOpen((prev) => !prev);
  };

  return (
    <YStack gap={space.sm}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        onPress={toggle}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
      >
        <Card padded={false} tone={open ? 'accent' : 'surface'}>
          <XStack minHeight={sizing.touchTarget}>
            <CardAccent color={open ? STATUS_COLOR.ACCENT : STATUS_COLOR.NEUTRAL} />
            <XStack f={1} ai="center" gap={space.sm} p={space.md}>
              <IconDisc
                icon={icon}
                tone={open ? colors.primaryActive : colors.textMuted}
                surface={open ? colors.primaryLight : colors.surfaceMuted}
              />
              <Text
                f={1}
                minWidth={0}
                col={colors.text}
                fos={fontSize.bodyLg}
                fow={fontWeight.bold}
              >
                {label}
              </Text>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={iconSize.sm}
                color={open ? colors.primaryActive : colors.textMuted}
              />
            </XStack>
          </XStack>
        </Card>
      </Pressable>

      {mounted ? (
        <YStack gap={layout.inline} display={open ? 'flex' : 'none'}>
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Xe không đăng dịch vụ này — nói thẳng, đúng câu web dùng, thay vì bày một form vô nghĩa. */
function ServiceOff({ label }: { label: string }) {
  return (
    <Card tone="muted" lift="flat">
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
    </Card>
  );
}
