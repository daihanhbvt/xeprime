import { SERVICE_TYPE } from '@xeprime/types';

import { AutoAcceptSection } from '@/features/vehicle-manage/components/sections/AutoAcceptSection';

/** Mục "Tối ưu chuyến có tài xế" — nội dung thật nằm ở component dùng chung; trang chỉ là điểm vào theo URL. */
export default function Page() {
  return <AutoAcceptSection serviceType={SERVICE_TYPE.WITH_DRIVER} />;
}
