import type { Metadata } from 'next';
import { AdminLocationsView } from '@/features/locations/components/AdminLocationsView';

export const metadata: Metadata = { title: 'Danh mục tỉnh/thành' };

export default function AdminLocationsPage() {
  return <AdminLocationsView />;
}
