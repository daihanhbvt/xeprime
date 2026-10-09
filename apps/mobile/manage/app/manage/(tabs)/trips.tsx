import { OwnerTripsScreen } from '@/features/trips/OwnerTripsScreen';

/**
 * "Chuyến cho thuê" — CHỦ xe tuyến hoa hồng (Owner Lite, web `/manage/trips`). Một danh sách gộp
 * yêu cầu + đơn; thành viên mở đường này được `partnerPathRedirect` đưa về hộp thư.
 */
export default function ManageTripsRoute() {
  return <OwnerTripsScreen />;
}
