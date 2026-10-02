import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { YStack } from 'tamagui';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import {
  VEHICLE_MANAGE_SECTION,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';
import { space } from '@/theme/tokens';
import { VehicleManageShell, type VehicleSectionWorkspace } from './components/VehicleManageShell';
import { AutoAcceptBody } from './VehicleAutoAcceptScreen';
import { TermsBody } from './VehicleTermsScreen';

/** Bao lâu sau khi mở màn thì còn tự cuộn theo khối thủ tục (hai khối tải dữ liệu riêng). */
const ANCHOR_SETTLE_MS = 1500;

export interface BookingTermsBodyProps {
  vehicleId: string;
  serviceType: ServiceType;
  canEdit: boolean;
  /** Cổng quản lý hay khu tài khoản — quyết định khối bảo đảm có cần "Tuỳ chỉnh" để mở không. */
  isManage: boolean;
  /** Bản native của neo `#rental-terms`: báo vị trí khối thủ tục để màn chứa cuộn tới. */
  onTermsLayout?: (y: number) => void;
}

/**
 * Thân "Nhận chuyến & thủ tục" — web `BookingTermsSection`: card tối ưu nhận chuyến + card thủ
 * tục cho thuê. Mỗi card TỰ LƯU bằng mutation của chính nó; gom chỉ đổi chỗ bày.
 *
 * Xuất riêng để màn sửa xe của app Partner dùng lại với vỏ của nó (`isManage`).
 */
export function BookingTermsBody({
  vehicleId,
  serviceType,
  canEdit,
  isManage,
  onTermsLayout,
}: BookingTermsBodyProps) {
  return (
    <YStack gap={space.lg}>
      <AutoAcceptBody vehicleId={vehicleId} serviceType={serviceType} canEdit={canEdit} />
      <YStack
        {...(onTermsLayout
          ? { onLayout: (e: LayoutChangeEvent) => onTermsLayout(e.nativeEvent.layout.y) }
          : {})}
      >
        <TermsBody
          vehicleId={vehicleId}
          serviceType={serviceType}
          canEdit={canEdit}
          isManage={isManage}
        />
      </YStack>
    </YStack>
  );
}

/**
 * Mục "Nhận chuyến & thủ tục" của MỘT dịch vụ — không gian Quản lý xe ở khu tài khoản, hoặc mục
 * của màn sửa xe ở app Partner (`workspace="manage"`).
 *
 * `scrollToTerms` — mở từ đường dẫn cũ "Thủ tục cho thuê" (web chuyển hướng kèm `#rental-terms`):
 * cuộn tới card thủ tục khi nó đã có chỗ đứng.
 */
export function VehicleBookingTermsScreen({
  vehicleId,
  serviceType,
  scrollToTerms = false,
  workspace = 'account',
}: {
  vehicleId: string;
  serviceType: ServiceType;
  scrollToTerms?: boolean;
  /** `manage` = mục của màn sửa xe ở app Partner — `isManage` cho khối thủ tục, Lui về hub sửa xe. */
  workspace?: VehicleSectionWorkspace;
}) {
  const section: VehicleManageSection =
    serviceType === SERVICE_TYPE.WITH_DRIVER
      ? VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION
      : VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION;
  const scrollRef = useRef<ScrollView | null>(null);
  const containerY = useRef(0);
  const following = useRef(scrollToTerms);

  /*
   * Card thủ tục đứng sau card tối ưu và cả hai tải riêng, nên vị trí của nó còn đổi trong lúc
   * tải. Theo nó một nhịp ngắn rồi thôi — để người dùng cuộn tự do sau đó.
   */
  useEffect(() => {
    if (!scrollToTerms) return;
    const timer = setTimeout(() => {
      following.current = false;
    }, ANCHOR_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [scrollToTerms]);

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={section}
      scrollRef={scrollRef}
      workspace={workspace}
    >
      {({ canEdit }) => (
        <YStack
          onLayout={(e: LayoutChangeEvent) => {
            containerY.current = e.nativeEvent.layout.y;
          }}
        >
          <BookingTermsBody
            vehicleId={vehicleId}
            serviceType={serviceType}
            canEdit={canEdit}
            isManage={workspace === 'manage'}
            {...(scrollToTerms
              ? {
                  onTermsLayout: (y: number) => {
                    if (!following.current) return;
                    scrollRef.current?.scrollTo({ y: containerY.current + y, animated: false });
                  },
                }
              : {})}
          />
        </YStack>
      )}
    </VehicleManageShell>
  );
}
