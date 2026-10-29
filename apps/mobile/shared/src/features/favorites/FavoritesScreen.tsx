import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, type ListRenderItemInfo } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FAVORITE_DEFAULT_VEHICLE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type FavoriteVehicle,
  type VehicleType,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { FavoriteVehicleCard, FavoriteVehicleCardSkeleton } from './components/FavoriteVehicleCard';
import { useFavoritesList } from './hooks/use-favorites-list';

const SKELETON_CARDS = 3;

/**
 * Màn "Xe yêu thích" (`/account/favorites`, BRD §5.2) — bản native của web `FavoritesView`: hai tab
 * Ô tô / Xe máy (mặc định Ô tô), danh sách tải tiếp theo trang server (cuộn tới cuối tự tải tiếp — web dùng nút "Xem thêm"), đủ
 * trạng thái đang tải / rỗng / lỗi + thử lại. Cổng đăng nhập do route (`RequireSession`) lo.
 */
export function FavoritesScreen() {
  const t = useTranslations('Favorites');
  const router = useRouter();
  const [vehicleType, setVehicleType] = useState<VehicleType>(FAVORITE_DEFAULT_VEHICLE_TYPE);

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('page.title')}
        subtitle={t('page.subtitle')}
      />
      <FavoriteTabs value={vehicleType} onChange={setVehicleType} />
      <Screen edges={['left', 'right', 'bottom']} padded={false} scroll={false}>
        {/* `key` theo tab: đổi tab là một danh sách mới, không mang trạng thái của tab trước. */}
        <FavoritesTab key={vehicleType} vehicleType={vehicleType} />
      </Screen>
    </>
  );
}

/** Thanh tab gạch chân như `Tabs` của web (chữ đậm vừa, tab đang mở vàng + vạch vàng). */
function FavoriteTabs({
  value,
  onChange,
}: {
  value: VehicleType;
  onChange: (next: VehicleType) => void;
}) {
  const t = useTranslations('Favorites');
  const dl = useDomainLabel();
  // Số xe mỗi tab đọc CHUNG khoá query với danh sách của tab đó (không gọi API trùng); chưa có số thì không vẽ viên.
  const car = useFavoritesList(VEHICLE_TYPE.CAR);
  const motorbike = useFavoritesList(VEHICLE_TYPE.MOTORBIKE);
  const lists = { [VEHICLE_TYPE.CAR]: car, [VEHICLE_TYPE.MOTORBIKE]: motorbike } as const;

  return (
    // Khuôn dải tab chung của app (`SegmentedTabs`, người dùng chốt 28/10/2026).
    <XStack px={layout.screenX} pt={space.sm}>
      <SegmentedTabs
        items={VEHICLE_TYPE_VALUES.map((type) => {
          const list = lists[type];
          const counted = !list.isInitialLoading && !list.initialError;
          const label = dl('vehicleType', type);
          return {
            key: type,
            label,
            ...(counted ? { count: list.total } : {}),
            accessibilityLabel: counted ? t('tabs.withCount', { type: label, count: list.total }) : label,
          };
        })}
        value={value}
        onChange={onChange}
      />
    </XStack>
  );
}

const keyOf = (vehicle: FavoriteVehicle) => vehicle.id;
const renderItem = ({ item }: ListRenderItemInfo<FavoriteVehicle>) => (
  <FavoriteVehicleCard vehicle={item} />
);

function FavoritesTab({ vehicleType }: { vehicleType: VehicleType }) {
  const colors = useColors();
  const t = useTranslations('Favorites');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const list = useFavoritesList(vehicleType);
  /*
   * Vòng quay CHỈ khi khách kéo: mỗi lượt "Bỏ thích" làm mới cache danh sách (`onSettled`), gắn
   * vào `isRefetching` là vòng quay tự bật ở đầu danh sách dù không ai chạm vào.
   */
  const pull = usePullRefresh(list.refresh);

  if (list.isInitialLoading) {
    return (
      <YStack p={space.md} gap={space.md} accessibilityLabel={tCommon('states.loading')}>
        {Array.from({ length: SKELETON_CARDS }, (_, i) => (
          <FavoriteVehicleCardSkeleton key={i} />
        ))}
      </YStack>
    );
  }

  if (list.initialError) {
    return <ScreenError error={list.initialError} title={t('error.title')} onRetry={list.retry} />;
  }

  return (
    <FlatList
      data={list.items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      onEndReached={() => {
        // Đang lỗi tải thêm thì đợi khách bấm "Thử lại" — không tự gọi lại liên tục.
        if (!list.appendError) list.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      contentContainerStyle={{ padding: space.md, gap: space.md, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListEmptyComponent={
        <YStack f={1} jc="center" gap={space.md} py={space.xl} px={space.md}>
          <ScreenMessage
            icon="file-tray-outline"
            title={t(vehicleType === VEHICLE_TYPE.MOTORBIKE ? 'empty.motorbike' : 'empty.car')}
            description={t('empty.body')}
          />
          {/*
            Không có nút "Tìm xe" như web `.emptyCta`: người dùng chốt 27/10/2026 — trên app, màn
            TRỐNG DỮ LIỆU chỉ nói không có gì, không mời hành động.
          */}
        </YStack>
      }
      ListFooterComponent={
        list.items.length > 0 ? (
          <YStack gap={space.md}>
            {list.appendError ? (
              <Callout tone="warning" title={t('error.loadMore', { reason: errorMessage(list.appendError) })}>
                <Button
                  label={tCommon('actions.retry')}
                  variant="secondary"
                  size="sm"
                  block={false}
                  onPress={list.fetchNextPage}
                />
              </Callout>
            ) : null}
            {/* App cuộn tới cuối là tự tải trang sau (người dùng chốt 28/10/2026) — không có nút "Xem thêm" như web. */}
            {list.isFetchingNextPage ? (
              <YStack ai="center" py={space.sm}>
                <ActivityIndicator color={colors.primaryActive} />
              </YStack>
            ) : null}
          </YStack>
        ) : null
      }
    />
  );
}
