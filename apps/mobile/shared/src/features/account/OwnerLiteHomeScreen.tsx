import { OWNER_STAGE } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useOpenPushPermissionGate } from '@/features/notifications/push-permission-gate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { AccountVehiclesScreen } from './AccountVehiclesScreen';
import { OwnerGate } from './components/OwnerGate';
import { useOwnerAccess } from './hooks/use-owner-access';
import { OwnerRegistrationScreen } from './OwnerRegistrationScreen';

/**
 * Trang chủ của chủ xe tuyến HOA HỒNG trong app XePrime Partner — bản native của `OwnerLiteHome`
 * bên web (ADR 0053: Owner Lite rời khu tài khoản của app khách, về site/app partner).
 *
 *  - đã có xe lên chợ → danh sách xe (việc hằng ngày), mở đầu bằng dải tuyến;
 *  - đang đăng ký → tiến trình "Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ";
 *  - thành viên không phải chủ → `OwnerGate` giải thích (kèm thanh menu để còn đi nơi khác).
 */
export function OwnerLiteHomeScreen() {
  /*
   * Màn chính của tuyến hoa hồng ⇒ đây là nơi mở cửa xin quyền thông báo. Cửa chỉ mở ở một MÀN
   * CHÍNH, và chủ xe hoa hồng trong app Partner hạ cánh ở ĐÂY — không ở `ShopDashboardScreen`
   * (tuyến gói), cũng không ở `HomeScreen` (marketplace, chỉ có trong app khách). Thiếu dòng này
   * thì họ không bao giờ được hỏi quyền, và thiết bị im lặng vĩnh viễn mà không có lỗi nào.
   *
   * Gọi TRƯỚC mọi return sớm: `isLoading` và `OwnerGate` đều là nhánh thoát, hook phải chạy ở
   * mọi lượt render.
   */
  useOpenPushPermissionGate();
  const { stage, isLoading } = useOwnerAccess();

  if (isLoading) {
    return (
      <>
        <ManageHeader />
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (stage === OWNER_STAGE.OWNER) return <AccountVehiclesScreen shell="manage" />;
  if (stage === OWNER_STAGE.REGISTERING) return <OwnerRegistrationScreen shell="manage" />;

  // Không qua cổng: `OwnerGate` tự vẽ màn giải thích; thanh menu đứng trên để không thành ngõ cụt.
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING} header={<ManageHeader />}>
      {null}
    </OwnerGate>
  );
}

/**
 * Mục "Xe của tôi" của tuyến hoa hồng trong app Partner — web `/vehicles` của site partner:
 * `<OwnerGate minStage={REGISTERING}><AccountVehiclesView /></OwnerGate>`.
 */
export function OwnerLiteVehiclesScreen() {
  const { stage, isLoading } = useOwnerAccess();
  if (!isLoading && stage !== OWNER_STAGE.NONE) return <AccountVehiclesScreen shell="manage" />;
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING} header={<ManageHeader />}>
      {null}
    </OwnerGate>
  );
}
