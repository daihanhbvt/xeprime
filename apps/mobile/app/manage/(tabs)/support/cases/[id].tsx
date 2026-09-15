import { useLocalSearchParams } from 'expo-router';
import { SUPPORT_SURFACE } from '@/features/support-cases/api';
import { SupportCaseDetailScreen } from '@/features/support-cases/SupportCaseDetailScreen';

/** Một yêu cầu hỗ trợ của gian hàng — dòng thời gian, trả lời, đóng yêu cầu. */
export default function ManageSupportCaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SupportCaseDetailScreen caseId={id} surface={SUPPORT_SURFACE.TENANT} />;
}
