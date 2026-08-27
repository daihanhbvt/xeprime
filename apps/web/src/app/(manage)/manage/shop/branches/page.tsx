import type { Metadata } from 'next';
import { BranchesView } from '@/features/branches/components/BranchesView';

export const metadata: Metadata = { title: 'Chi nhánh' };

export default function BranchesPage() {
  return <BranchesView />;
}
