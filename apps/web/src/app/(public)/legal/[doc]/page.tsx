import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LEGAL_DOC_VALUES, isLegalDoc } from '@/constants/legal';
import { LegalDocumentView } from '@/features/legal/components/LegalDocumentView';

/**
 * Bốn văn bản pháp lý dùng CHUNG một route động.
 *
 * Một route thay vì bốn file gần giống nhau: bố cục, băng bản thảo, mục lục và khối "văn bản
 * liên quan" phải giống hệt nhau ở cả bốn — bốn bản sao là bốn cơ hội để một bản bị sửa lệch.
 * Slug hợp lệ do `LEGAL_DOC_VALUES` quyết định, nên `/legal/bat-ky-gi` trả 404 thật chứ không
 * render một trang trống.
 */
export function generateStaticParams() {
  return LEGAL_DOC_VALUES.map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDoc(doc)) return {};

  const t = await getTranslations('Legal');
  return {
    title: t(`docs.${doc}.title` as never),
    description: t(`docs.${doc}.summary` as never),
    // Bản thảo chưa qua rà soát pháp lý thì KHÔNG được để công cụ tìm kiếm đánh chỉ mục —
    // gỡ dòng này cùng lúc với băng "bản thảo", không sớm hơn.
    robots: { index: false, follow: true },
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  return <LegalDocumentView doc={doc} />;
}
