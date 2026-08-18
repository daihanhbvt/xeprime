import { AUTH_PROVIDER, type AuthProvider } from '@/features/auth/constants';

interface SocialProviderLogoProps {
  provider: AuthProvider;
  className?: string;
}

/** Logo thương hiệu là SVG riêng; không recolor bằng theme và không đi qua bộ tối ưu ảnh Next.js. */
export function SocialProviderLogo({ provider, className }: SocialProviderLogoProps) {
  if (provider === AUTH_PROVIDER.GOOGLE) {
    return (
      <svg
        viewBox="0 0 118 120"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <path
          fill="#4285F4"
          d="M117.6 61.364c0-4.255-.382-8.346-1.091-12.273H60V72.3h32.291c-1.391 7.5-5.618 13.855-11.973 18.109v15.055h19.391C111.055 95.018 117.6 79.636 117.6 61.364Z"
        />
        <path
          fill="#34A853"
          d="M60 120c16.2 0 29.782-5.373 39.709-14.536L80.318 90.409C74.945 94.009 68.073 96.136 60 96.136c-15.627 0-28.855-10.554-33.573-24.736L6.382 71.4v15.545C16.255 106.555 36.545 120 60 120Z"
        />
        <path
          fill="#FBBC05"
          d="M26.427 71.4A35.8 35.8 0 0 1 24.545 60c0-3.955.682-7.8 1.882-11.4V33.055H6.382A59.75 59.75 0 0 0 0 60c0 9.682 2.318 18.845 6.382 26.945L26.427 71.4Z"
        />
        <path
          fill="#EA4335"
          d="M60 23.864c8.809 0 16.718 3.027 22.936 8.972l17.21-17.209C89.754 5.945 76.172 0 60 0 36.545 0 16.255 13.445 6.382 33.055L26.427 48.6C31.145 34.418 44.373 23.864 60 23.864Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"
      />
    </svg>
  );
}
