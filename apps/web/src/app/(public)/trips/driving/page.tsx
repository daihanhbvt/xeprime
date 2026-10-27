import { redirect } from 'next/navigation';
import { drivingTripPath } from '@/constants/routes';

/** `/trips/driving` trần không có màn riêng — danh sách "Chuyến tôi lái" nằm đầu trang "Nơi tôi làm tài xế". */
export default function DrivingTripsIndex() {
  redirect(drivingTripPath.list);
}
