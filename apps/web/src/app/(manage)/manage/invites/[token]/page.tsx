import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { InviteAnswerCard } from '@/features/members/components/InviteAnswerCard';

/**
 * Người được mời mở thư và quyết định — `/invites/<token>`.
 *
 * Nằm ở route group `(public)` chứ không phải `(manage)`, và đó là điểm mấu chốt: người mở
 * trang này CHƯA thuộc gian hàng nào, và có thể còn chưa có tài khoản. Đặt nó sau tường của
 * cổng quản lý là bắt họ đăng nhập vào một nơi họ chưa có quyền vào.
 *
 * Token nằm trên URL nên trang không được đánh chỉ mục, và cũng không có gì để index: nội dung
 * thật chỉ hiện sau một lời gọi API kèm token.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Members.invitePage');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAnswerCard token={token} />;
}
