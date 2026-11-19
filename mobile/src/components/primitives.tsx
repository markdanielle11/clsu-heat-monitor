import * as Haptics from 'expo-haptics';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info, WifiSlash, Warning } from 'phosphor-react-native';
import { useReduceMotion } from '@/hooks/useNow';
import { radius, space, type, useTheme, type Palette } from '@/theme';

// ------------------------------------------------------------------- text
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'critical' | 'onAccent';
const toneKey: Record<Tone, keyof Palette> = {
  primary: 'text',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  critical: 'critical',
  onAccent: 'onAccent',
};

interface TProps extends TextProps {
  v?: keyof typeof type;
  tone?: Tone;
  color?: string;
}

export function T({ v = 'body', tone = 'primary', color, style, ...rest }: TProps) {
  const t = useTheme();
  return <Text {...rest} style={[type[v] as TextStyle, { color: color ?? t.colors[toneKey[tone]] }, style]} />;
}

// ------------------------------------------------------------------ layout
export function Screen(props: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl, paddingHorizontal: space.lg, gap: space.lg }}
      refreshControl={
        props.onRefresh ? <RefreshControl refreshing={!!props.refreshing} onRefresh={props.onRefresh} tintColor={t.colors.textSecondary} /> : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: space.xs }}>
        <T v="largeTitle" accessibilityRole="header">
          {props.title}
        </T>
        {props.subtitle ? (
          <T v="subhead" tone="secondary">
            {props.subtitle}
          </T>
        ) : null}
      </View>
      {props.children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.colors.card, borderRadius: radius.card, padding: space.lg, gap: space.md }, style]}>{children}</View>;
}

/** iOS-style grouped list: rows separated by hairlines inside one rounded card. */
export function Group({ children, header, footer }: { children: ReactNode; header?: string; footer?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {header ? (
        <T v="footnote" tone="secondary" style={{ paddingHorizontal: space.lg, textTransform: 'uppercase', letterSpacing: 0.4 }} accessibilityRole="header">
          {header}
        </T>
      ) : null}
      <View style={{ backgroundColor: t.colors.card, borderRadius: radius.card, overflow: 'hidden' }}>{children}</View>
      {footer ? (
        <T v="footnote" tone="secondary" style={{ paddingHorizontal: space.lg }}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}

export function Row(props: {
  label: string;
  detail?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  tone?: 'primary' | 'accent' | 'critical';
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const body = (
    <View
      style={{
        minHeight: 52,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        borderBottomWidth: props.last ? 0 : 1,
        borderBottomColor: t.colors.separator,
      }}
    >
      {props.left}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" tone={props.tone ?? 'primary'}>
          {props.label}
        </T>
        {props.detail ? (
          <T v="footnote" tone="secondary">
            {props.detail}
          </T>
        ) : null}
      </View>
      {props.right}
    </View>
  );
  if (!props.onPress) return body;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} accessibilityHint={props.accessibilityHint} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

// ---------------------------------------------------------------- controls
export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'tinted';
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
}) {
  const t = useTheme();
  const primary = (props.variant ?? 'primary') === 'primary';
  const off = props.disabled || props.busy;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!off, busy: !!props.busy }}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: radius.control,
        paddingHorizontal: space.lg,
        backgroundColor: primary ? t.colors.accent : t.colors.accentTint,
        opacity: off ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
      })}
    >
      {props.icon}
      <T v="headline" color={primary ? t.colors.onAccent : t.colors.accent} numberOfLines={1}>
        {props.busy ? 'Please wait' : props.label}
      </T>
    </Pressable>
  );
}

export function Segmented<K extends string>(props: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={props.label} style={{ flexDirection: 'row', backgroundColor: t.colors.cardAlt, borderRadius: radius.control, padding: 3 }}>
      {props.items.map((it) => {
        const selected = it.key === props.value;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync().catch(() => undefined);
              props.onChange(it.key);
            }}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: radius.control - 3,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? t.colors.card : 'transparent',
            }}
          >
            <T v="subhead" style={{ fontWeight: selected ? '600' : '400' }} tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
              {it.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ states
export function Banner({ kind, children }: { kind: 'warn' | 'offline'; children: ReactNode }) {
  const t = useTheme();
  const Icon = kind === 'offline' ? WifiSlash : Warning;
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', backgroundColor: t.colors.warnBg, borderRadius: radius.control, padding: space.md }}
    >
      <Icon size={20} weight="bold" color={t.colors.warnText} />
      <T v="footnote" color={t.colors.warnText} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <Info size={16} weight="bold" color={t.colors.textSecondary} style={{ marginTop: 1 }} />
      <T v="footnote" tone="secondary" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduce) {
      pulse.setValue(0.7);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: 8, backgroundColor: t.colors.cardAlt, opacity: pulse }, style]} />;
}

export function StateMessage(props: { title: string; body: string; action?: { label: string; onPress: () => void }; icon?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.md }}>
      {props.icon}
      <T v="headline" style={{ textAlign: 'center' }}>
        {props.title}
      </T>
      <T v="subhead" tone="secondary" style={{ textAlign: 'center' }}>
        {props.body}
      </T>
      {props.action ? (
        <View style={{ alignSelf: 'stretch', marginTop: space.sm }}>
          <Button label={props.action.label} onPress={props.action.onPress} variant="tinted" />
        </View>
      ) : null}
    </Card>
  );
}
