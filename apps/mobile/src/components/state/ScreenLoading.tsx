import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, space } from '@/theme/tokens';

export function ScreenLoading({ label }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: space.sm,
    justifyContent: 'center',
    padding: space.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
});
