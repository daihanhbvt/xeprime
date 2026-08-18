export const AUTH_PROVIDER = {
  GOOGLE: 'google',
  FACEBOOK: 'facebook',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];

export const AUTH_PROVIDER_LABEL: Readonly<Record<AuthProvider, string>> = {
  [AUTH_PROVIDER.GOOGLE]: 'Google',
  [AUTH_PROVIDER.FACEBOOK]: 'Facebook',
};
