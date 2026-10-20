import { redirect } from 'next/navigation';
import { drivingTripPath } from '@/constants/routes';

/** `/trips/driving` trần không có màn riêng — danh sách là tab `?tab=driving` của "Chuyến của tôi". */
export default function DrivingTripsIndex() {
  redirect(drivingTripPath.list);
}
