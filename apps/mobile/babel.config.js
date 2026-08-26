module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/theme/tamagui.config.ts',
          // Chỉ tối ưu ở bản release: bật lúc dev làm Metro build lại chậm hẳn mà không
          // đổi được gì trên màn hình.
          disableExtraction: process.env.NODE_ENV === 'development',
        },
      ],
    ],
  };
};
