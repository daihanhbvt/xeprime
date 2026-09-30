import { PartnerHandoffScreen } from '@/features/partner-handoff/PartnerHandoffScreen';

/**
 * Đích của mọi lối `ROUTES.manage.*` ở app Customer — mời mở/tải XePrime Partner.
 * `intent` (tên builder vừa bấm) chỉ phục vụ đo đạc; màn không đọc nó để điều hướng.
 */
export default function PartnerHandoffRoute() {
  return <PartnerHandoffScreen />;
}
