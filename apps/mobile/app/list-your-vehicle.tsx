import { ListYourVehicleScreen } from '@/features/list-vehicle/ListYourVehicleScreen';

/**
 * `/list-your-vehicle` — landing CÔNG KHAI mời chủ xe đăng xe, cùng địa chỉ với web.
 *
 * KHÔNG bọc `RequireSession`: người chưa đăng nhập phải đọc được lời mời trước khi bị hỏi tài
 * khoản. Rẽ nhánh theo trạng thái thật nằm trong chính màn hình.
 */
export default function ListYourVehicleRoute() {
  return <ListYourVehicleScreen />;
}
