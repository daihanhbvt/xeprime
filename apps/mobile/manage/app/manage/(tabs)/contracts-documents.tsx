import { ContractsDocumentsScreen } from '@/features/account/ContractsDocumentsScreen';

/** Hợp đồng & Chứng từ MẪU — thư viện PDF tĩnh, không gọi API tenant (xem `host-guide.tsx`). */
export default function ManageOwnerLiteContractsDocumentsRoute() {
  return <ContractsDocumentsScreen shell="manage" />;
}
