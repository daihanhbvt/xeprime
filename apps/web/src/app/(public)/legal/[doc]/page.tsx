import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LEGAL_DOC_WEB_VALUES, LEGAL_WEB_ONLY_DOCS, isWebLegalDoc } from '@/constants/legal';
import { LegalDocumentView } from '@/features/legal/components/LegalDocumentView';
import { isCustomerAppWebView } from '@/lib/in-app-webview';

/**
 * Cả bộ văn bản pháp lý dùng CHUNG một route động.
 *
 * Một route thay vì chín file gần giống nhau: bố cục, mục lục và khối "văn bản liên quan" phải
 * giống hệt nhau ở mọi văn bản — chín bản sao là chín cơ hội để một bản bị sửa lệch. Slug hợp lệ
 * do `LEGAL_DOC_WEB_VALUES` quyết định, nên `/legal/bat-ky-gi` trả 404 thật chứ không render một
 * trang trống. Văn bản chỉ-web (`LEGAL_WEB_ONLY_DOCS`, vd điều kiện gói) trả 404 trong WebView của
 * app khách — app không được nhắc tới gói.
 */
export function generateStaticParams() {
  return LEGAL_DOC_WEB_VALUES.map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  if (!isWebLegalDoc(doc)) return {};

  const t = await getTranslations('Legal');
  return {
    title: t(`docs.${doc}.title` as never),
    description: t(`docs.${doc}.summary` as never),
    // Bản chưa qua luật sư duyệt thì KHÔNG được để công cụ tìm kiếm đánh chỉ mục — gỡ dòng này
    // cùng lúc dời `LEGAL_EFFECTIVE_FROM` về ngày công bố chính thức, không sớm hơn.
    robots: { index: false, follow: true },
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isWebLegalDoc(doc)) notFound();
  if (LEGAL_WEB_ONLY_DOCS.has(doc) && (await isCustomerAppWebView())) notFound();
  return <LegalDocumentView doc={doc} />;
}
