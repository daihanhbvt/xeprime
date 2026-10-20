import { AUTH_PROVIDER, type AuthProvider } from '@/features/auth/constants';

interface SocialProviderLogoProps {
  provider: AuthProvider;
  className?: string;
}

/**
 * Logo thương hiệu là SVG riêng; không recolor bằng theme và không đi qua bộ tối ưu ảnh Next.js.
 * Vector lấy từ "Social Icon" của design v2 (hộp đăng nhập, Figma `19786:74992`) — Facebook là
 * hình tròn xanh chữ f trắng, không phải chữ f trần.
 */
export function SocialProviderLogo({ provider, className }: SocialProviderLogoProps) {
  if (provider === AUTH_PROVIDER.GOOGLE) {
    return (
      <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false" className={className}>
        <path
          fill="#4285F4"
          d="M24.3761 13.2526C24.3761 12.3174 24.2987 11.6349 24.1311 10.9271H13.2333V15.1484H19.6301C19.5011 16.1975 18.8047 17.7774 17.2571 18.839L17.2354 18.9803L20.6811 21.5962L20.9198 21.6196C23.1122 19.6353 24.3761 16.7157 24.3761 13.2526"
        />
        <path
          fill="#34A853"
          d="M13.2326 24.375C16.3664 24.375 18.9974 23.3638 20.919 21.6197L17.2563 18.839C16.2762 19.5089 14.9607 19.9766 13.2326 19.9766C10.1632 19.9766 7.55803 17.9923 6.62938 15.2496L6.49326 15.261L2.91039 17.9784L2.86354 18.106C4.77224 21.8218 8.69287 24.375 13.2326 24.375Z"
        />
        <path
          fill="#FBBC05"
          d="M6.62971 15.2497C6.38467 14.5419 6.24286 13.7835 6.24286 12.9999C6.24286 12.2163 6.38467 11.458 6.61681 10.7502L6.61032 10.5995L2.98255 7.83846L2.86386 7.89379C2.07719 9.43575 1.62579 11.1673 1.62579 12.9999C1.62579 14.8326 2.07719 16.5641 2.86386 18.106L6.62971 15.2497"
        />
        <path
          fill="#EB4335"
          d="M13.2326 6.0233C15.4122 6.0233 16.8824 6.94594 17.7207 7.71696L20.9965 4.5825C18.9846 2.74987 16.3665 1.625 13.2326 1.625C8.6929 1.625 4.77225 4.17804 2.86354 7.89384L6.6165 10.7503C7.55806 8.00763 10.1632 6.0233 13.2326 6.0233"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false" className={className}>
      <circle cx="13" cy="13" r="11.375" fill="#1570EF" />
      <path
        fill="#FFFFFF"
        d="M17.2361 16.4788L17.7414 13.2682H14.5805V11.1857C14.5805 10.3071 15.0212 9.45024 16.437 9.45024H17.875V6.71693C17.875 6.71693 16.5705 6.5 15.324 6.5C12.7196 6.5 11.0189 8.03801 11.0189 10.8212V13.2682H8.125V16.4788H11.0189V24.2405C11.5998 24.3295 12.1942 24.375 12.7997 24.375C13.4051 24.375 13.9995 24.3295 14.5805 24.2405V16.4788H17.2361Z"
      />
    </svg>
  );
}
