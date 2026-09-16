module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] }),
    ],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/theme/tamagui.config.ts',
          // Bộ tối ưu Tamagui chưa tải được module native của Expo khi bundle release.
          // Giữ style runtime để APK build ổn định; bật lại sau khi bộ tối ưu tương thích.
          disableExtraction: true,
          disableDebugAttr: true,
        },
      ],
    ],
  };
};
