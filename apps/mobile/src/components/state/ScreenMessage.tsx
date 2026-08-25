import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

interface ScreenMessageProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ScreenMessage({ title, description, actionLabel, onAction }: ScreenMessageProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
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
  title: {
    color: colors.text,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.body,
    textAlign: 'center',
  },
});
