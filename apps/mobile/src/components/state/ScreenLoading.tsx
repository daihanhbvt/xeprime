import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

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
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
