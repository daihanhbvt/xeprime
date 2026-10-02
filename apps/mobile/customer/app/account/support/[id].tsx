import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { SUPPORT_SURFACE } from '@/features/support-cases/api';
import { SupportCaseDetailScreen } from '@/features/support-cases/SupportCaseDetailScreen';

/** Một yêu cầu hỗ trợ — dòng thời gian, trả lời, đóng yêu cầu. */
export default function AccountSupportCaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <SupportCaseDetailScreen caseId={id} surface={SUPPORT_SURFACE.CUSTOMER} />
    </RequireSession>
  );
}
