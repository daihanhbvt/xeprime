import { useRouter } from 'expo-router';
import { ListYourVehicleScreen } from '@/features/list-vehicle/ListYourVehicleScreen';
import { LogoutRow } from '@/features/shell/LogoutRow';
import { ROUTES } from '@/navigation/routes';

/**
 * Chọn cách cho thuê — tài khoản ĐỐI TÁC chưa có gian hàng (web `/register` của site partner khi đã
 * đăng nhập: `PartnerRegisterView` → `ListYourVehicleLanding showBack={false}`). Hai lối:
 *
 *  - đăng xe cá nhân (tuyến hoa hồng) → wizard đăng xe nhanh, gian hàng mở ở bước lưu;
 *  - mở gian hàng (tuyến gói) → onboarding gói (ADR 0040).
 *
 * `ScopeGuard` giữ tài khoản chưa có gian hàng ở đây; người đã có gian hàng mở màn này thì được đưa
 * về trang chủ theo tuyến. Không có menu nào để mở, nên đăng xuất đứng ngay cuối màn.
 */
export default function ManageRegisterRoute() {
  const router = useRouter();
  return (
    <ListYourVehicleScreen
      showBack={false}
      footer={<LogoutRow variant="link" onDone={() => router.replace(ROUTES.account.login())} />}
    />
  );
}
