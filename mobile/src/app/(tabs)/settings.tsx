import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Info, Lock, MapPin, Minus, PaperPlaneTilt, Plus, CaretRight } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { Banner, Group, Row, Screen, Segmented, T } from '@/components/primitives';
import { useAlerts } from '@/state/alerts';
import { useAppearance, type AppearancePref } from '@/state/appearance';
import { radius, space, useTheme } from '@/theme';

const MIN_C = 35;
const MAX_C = 52;

export default function Settings() {
  const t = useTheme();
  const router = useRouter();
  const a = useAlerts();
  const { pref, setPref } = useAppearance();
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const denied = a.permission === 'denied';
  const unsupported = a.permission === 'unsupported';
  const canEdit = a.active;

  const toggleAlerts = (on: boolean) => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (on) void a.enable();
    else void a.update({ notificationsEnabled: false });
  };

  const step = (delta: number) => {
    const next = Math.min(MAX_C, Math.max(MIN_C, a.settings.thresholdC + delta));
    if (next !== a.settings.thresholdC) {
      void Haptics.selectionAsync().catch(() => undefined);
      void a.update({ thresholdC: next });
    }
  };

  const sendTest = async () => {
    setTestState('sending');
    const ok = await a.sendTest();
    setTestState(ok ? 'sent' : 'idle');
    if (ok) setTimeout(() => setTestState('idle'), 4000);
  };

  return (
    <Screen title="Settings" subtitle="Alerts, location and data">
      {a.error ? <Banner kind="warn">{a.error}</Banner> : null}

      <Group
        header="Notifications"
        footer={
          denied
            ? 'Notifications are turned off for this app in iPhone Settings. Turn them on there, then come back.'
            : unsupported
              ? Platform.OS === 'web'
                ? 'Push alerts are not available in the web version. Install the iPhone app to receive them. This page still updates live.'
                : 'Push notifications need a real iPhone. They do not work in a simulator.'
              : `Default is ${42}°C. Extreme warnings always start at ${MAX_C}°C. The server checks the forecast every 15 minutes, so alerts arrive even when the app is closed.`
        }
      >
        <Row
          label="Heat alerts"
          detail={a.active ? 'On' : 'Off'}
          last={!denied && !canEdit}
          right={<Switch value={a.active} onValueChange={toggleAlerts} disabled={a.busy || unsupported || !a.ready} trackColor={{ true: t.colors.accent, false: t.colors.cardAlt }} ios_backgroundColor={t.colors.cardAlt} accessibilityLabel="Heat alerts" />}
        />
        {denied ? <Row label="Open iPhone Settings" tone="accent" onPress={a.openSystemSettings} last right={<CaretRight size={18} color={t.colors.textSecondary} />} /> : null}
        {canEdit ? (
          <>
            <Row
              label="Alert threshold"
              detail="Notify at or above this heat index"
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <StepButton label="Lower threshold" onPress={() => step(-1)} disabled={a.settings.thresholdC <= MIN_C} icon={<Minus size={18} weight="bold" color={t.colors.accent} />} />
                  <T v="headline" style={{ minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] }} accessibilityLabel={`Threshold ${a.settings.thresholdC} degrees`}>
                    {a.settings.thresholdC}°C
                  </T>
                  <StepButton label="Raise threshold" onPress={() => step(1)} disabled={a.settings.thresholdC >= MAX_C} icon={<Plus size={18} weight="bold" color={t.colors.accent} />} />
                </View>
              }
            />
            <Row
              label="High heat warnings"
              detail={`${a.settings.thresholdC} to 51°C`}
              right={<Switch value={a.settings.notifyHigh} onValueChange={(v) => void a.update({ notifyHigh: v })} trackColor={{ true: t.colors.accent, false: t.colors.cardAlt }} ios_backgroundColor={t.colors.cardAlt} accessibilityLabel="High heat warnings" />}
            />
            <Row
              label="Extreme heat warnings"
              detail="52°C and above"
              right={<Switch value={a.settings.notifyExtreme} onValueChange={(v) => void a.update({ notifyExtreme: v })} trackColor={{ true: t.colors.accent, false: t.colors.cardAlt }} ios_backgroundColor={t.colors.cardAlt} accessibilityLabel="Extreme heat warnings" />}
            />
            <Row
              label={testState === 'sending' ? 'Sending' : testState === 'sent' ? 'Test sent. Check your notifications.' : 'Send a test notification'}
              tone="accent"
              onPress={testState === 'sending' ? undefined : sendTest}
              left={<PaperPlaneTilt size={22} color={t.colors.accent} />}
              last
            />
          </>
        ) : null}
      </Group>

      <Group header="Monitoring location" footer="The location is fixed. This app only monitors CLSU and cannot be pointed at another place.">
        <Row left={<MapPin size={22} weight="fill" color={t.colors.textSecondary} />} label="Central Luzon State University" detail="Science City of Muñoz, Nueva Ecija, Philippines" right={<Lock size={18} color={t.colors.textSecondary} />} last />
      </Group>

      <Group header="Appearance">
        <View style={{ padding: space.lg }}>
          <Segmented
            label="Appearance"
            items={[
              { key: 'system' as AppearancePref, label: 'System' },
              { key: 'light' as AppearancePref, label: 'Light' },
              { key: 'dark' as AppearancePref, label: 'Dark' },
            ]}
            value={pref}
            onChange={setPref}
          />
        </View>
      </Group>

      <Group header="Information">
        <Row label="Weather data sources" detail="Where the numbers come from" onPress={() => router.navigate('/sources')} left={<Info size={22} color={t.colors.textSecondary} />} right={<CaretRight size={18} color={t.colors.textSecondary} />} />
        <Row label="About this app" onPress={() => router.navigate('/about')} last right={<CaretRight size={18} color={t.colors.textSecondary} />} />
      </Group>
    </Screen>
  );
}

function StepButton(props: { label: string; onPress: () => void; disabled: boolean; icon: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.control,
        backgroundColor: t.colors.accentTint,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: props.disabled ? 0.4 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {props.icon}
    </Pressable>
  );
}
