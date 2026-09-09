import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BranchesView } from '@/features/branches/components/BranchesView';

/**
 * Tiêu đề tab đi qua `getTranslations` chứ không phải một chuỗi hằng: locale nằm ở cookie
 * `XP_LOCALE` và được đọc phía SERVER (ADR 0012), nên metadata cũng phải theo — một tab tiếng
 * Việt trên giao diện tiếng Anh là chỗ rò ngôn ngữ dễ lọt nhất.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Branches');
  return { title: t('page.title') };
}

export default function BranchesPage() {
  return <BranchesView />;
}
