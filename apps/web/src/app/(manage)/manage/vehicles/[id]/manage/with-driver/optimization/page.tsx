import { SERVICE_TYPE } from '@xeprime/types';

import { BookingTermsSection } from '@/features/vehicle-manage/components/sections/BookingTermsSection';

/** Mục "Nhận chuyến & thủ tục" của có tài xế — tối ưu nhận chuyến + thủ tục cho thuê. */
export default function Page() {
  return <BookingTermsSection serviceType={SERVICE_TYPE.WITH_DRIVER} />;
}
