import { SERVICE_TYPE } from '@xeprime/types';

import { AutoAcceptSection } from '@/features/vehicle-manage/components/sections/AutoAcceptSection';

/** Mục "Tối ưu nhận chuyến tự lái" — nội dung thật nằm ở component dùng chung; trang chỉ là điểm vào theo URL. */
export default function Page() {
  return <AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />;
}
