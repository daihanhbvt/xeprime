import { SERVICE_TYPE } from '@xeprime/types';

import { TermsSection } from '@/features/vehicle-manage/components/sections/TermsSection';

/** Mục "Thủ tục cho thuê tự lái" — nội dung thật nằm ở component dùng chung; trang chỉ là điểm vào theo URL. */
export default function Page() {
  return <TermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />;
}
