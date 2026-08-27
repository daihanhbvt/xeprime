/// <reference types="expo/types" />

declare module '*.png' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}

declare module '*.jpg' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}

declare module '*.jpeg' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}

declare module '*.webp' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}

declare module '*.gif' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}

/** Font đi qua `expo-font`, không phải `ImageSourcePropType` — nó là một module asset. */
declare module '*.ttf' {
  const source: number;
  export default source;
}
