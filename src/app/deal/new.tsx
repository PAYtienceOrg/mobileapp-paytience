import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Badge, Button, Card, Chip, Gap, Header, ProgressBar, Row, Screen, SproutSays, T, tap } from '@/components/ui';
import { InfoDot, Term } from '@/components/widgets';
import { getAsset, isPaused, SOL_FEE_RESERVE, spendable } from '@/data/assets';
import { hasPracticeToken } from '@/data/practice';
import { fmtDay, fmtPrice, fmtSignedPct, fmtTime, fmtUnits, fmtUsd } from '@/domain/format';
import { dealMath, defaultEndDate, endDatesOf, Goal, LIMITS, quickDates, suggestedTarget, targetsOf } from '@/domain/pricing';
import { useBoard } from '@/live/boards';
import { useStore } from '@/store/app-store';
import { colors, fonts, radius, space, sticker } from '@/theme';

type Step = 0 | 1 | 2;
const STEP_TITLES = ['Pick an end date', 'Pick a target price', 'How much?'];
const GOAL_LABEL: Record<Goal, string> = { sell: 'Sell High', buy: 'Buy Low' };
const GOAL_COLOR: Record<Goal, string> = { sell: colors.blue, buy: colors.pinkDeep };

export default function NewDeal() {
  const params = useLocalSearchParams<{ symbol: string; goal: string }>();
  const asset = getAsset(params.symbol);
  const canBuy = !!asset?.buyLow;
  const [goal, setGoal] = useState<Goal>(params.goal === 'sell' || !canBuy ? 'sell' : 'buy');
  const { state } = useStore();

  // dates and targets come from the backend's live board for this asset
  const { board, loading, error } = useBoard(asset && !isPaused(asset) ? asset.symbol : undefined, goal);
  const dates = endDatesOf(board);
  const [step, setStep] = useState<Step>(0);
  const [pickedEnd, setPickedEnd] = useState<number | undefined>(undefined);
  const [targetPrice, setTargetPrice] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [allDates, setAllDates] = useState(false);

  // End dates roll daily and the board refreshes every 30 s, so a picked date can close under the user.
  if (pickedEnd !== undefined && board && !dates.some((d) => d.ts === pickedEnd)) {
    setPickedEnd(undefined);
    setTargetPrice(null);
    setStep(0);
    setNotice('That end date just closed. Here are the dates open now.');
  }
  const endTs = pickedEnd ?? defaultEndDate(dates)?.ts;
  const end = dates.find((d) => d.ts === endTs);
  const targets = targetsOf(goal, board, end?.ts);
  const picked = targets.find((t) => t.target === targetPrice);
  // the same goes for a picked target when the board's prices move
  if (targetPrice !== null && board && end && !picked) {
    setTargetPrice(null);
    if (step === 2) setStep(1);
    setNotice('Prices just updated, so the target list changed. Check your pick.');
  }
  // until the user picks, suggest the same target the asset page used as its example
  const target = picked ?? suggestedTarget(targets);

  const holdingFor = (g: Goal) => (!asset ? 0 : g === 'sell' ? spendable(state.balances.tokens, asset.symbol) : state.balances.usdc);
  const defaultAmount = (g: Goal) => {
    if (g === 'buy' || !asset) return g === 'buy' ? '100' : '1';
    const bal = holdingFor('sell');
    return bal > 0 ? String(Number(Math.min(bal, 1).toPrecision(4))) : String(Number((100 / asset.price).toPrecision(3)));
  };
  const [amountText, setAmountText] = useState(() => defaultAmount(goal));
  const amount = parseFloat(amountText.replace(',', '.')) || 0;
  const balance = holdingFor(goal);

  if (!asset) {
    return (
      <Screen header={<Header />}>
        <SproutSays mood="worried">We couldn’t find that asset.</SproutSays>
      </Screen>
    );
  }

  const switchGoal = () => {
    if (!canBuy) return;
    const g: Goal = goal === 'sell' ? 'buy' : 'sell';
    tap();
    setGoal(g);
    setTargetPrice(null);
    setAmountText(defaultAmount(g));
    setNotice(null);
    if (step === 2) setStep(1);
    router.setParams({ goal: g });
  };

  const unit = goal === 'sell' ? asset.ticker : '$';
  const math = target ? dealMath(goal, asset, target, amount) : undefined;

  let amountError: string | null = null;
  if (amount <= 0) amountError = 'Enter an amount above zero.';
  else if (math && math.dealSizeUsd > LIMITS.maxDealUsd) amountError = `One deal can be up to ${fmtUsd(LIMITS.maxDealUsd)} right now.`;
  else if (math && math.dealSizeUsd < LIMITS.minDealUsd) amountError = `Too small to pay out. Try at least ${fmtUsd(LIMITS.minDealUsd)}.`;
  const overBalance = !!state.wallet && state.balances.loaded && amount > balance + 1e-9;
  const balanceLabel = goal === 'sell' ? `${fmtUnits(balance, asset.symbol)} ${asset.ticker}` : fmtUsd(balance);

  const presets =
    goal === 'buy'
      ? [25, 50, 100, 500].map((v) => ({ label: `$${v}`, value: v }))
      : [0.25, 0.5, 0.75, 1].map((f) => ({ label: f === 1 ? 'Max' : `${f * 100}%`, value: Number((balance * f).toPrecision(4)) }));

  // only a handful of dates up front; QQQ and SPY can offer sixteen
  const quick = quickDates(dates);
  const showAll = allDates || dates.length <= 4;
  const shownDates = showAll ? dates : dates.filter((d) => quick.some((q) => q.ts === d.ts) || d.ts === endTs);

  const goTo = (s: Step) => {
    tap();
    setNotice(null);
    setStep(s);
  };
  const next = () => {
    setNotice(null);
    if (step < 2) {
      if (step === 1 && target) setTargetPrice(target.target);
      setStep((step + 1) as Step);
    } else if (target && end) {
      router.push({
        pathname: '/deal/review',
        params: { symbol: asset.symbol, goal, end: String(end.ts), target: String(target.target), amount: String(amount) },
      });
    }
  };

  const paused = isPaused(asset);
  // Sell High with none of the token: the user can look at offers, but not open a deal
  const preview = goal === 'sell' && !!state.wallet && state.balances.loaded && !(balance > 0);
  const practiceToken = goal === 'sell' ? asset.symbol : 'USDC';
  const practiceOk = hasPracticeToken(practiceToken);
  const practiceName = goal === 'sell' ? asset.ticker : 'money';
  const getPractice = step === 2 && overBalance && !amountError && practiceOk;

  let blocked: string | null = null;
  if (paused) blocked = `Prices for ${asset.name} are paused right now. Try again soon.`;
  else if (step < 2 && !board && loading) blocked = 'Loading live offers…';
  else if (step === 0 && !end) blocked = 'Pick an end date to continue.';
  else if (step === 1 && !target) blocked = targets.length === 0 ? 'No offers for this date. Pick another date.' : 'Pick a target price to continue.';
  else if (step === 2)
    blocked =
      amountError ??
      (!overBalance
        ? null
        : goal === 'sell' && asset.symbol === 'SOL' && balance > 0
          ? `You can lock up to ${balanceLabel}. ${SOL_FEE_RESERVE} SOL stays in your wallet for network fees.`
          : practiceOk
          ? `You have ${balanceLabel}. Lower the amount or get free practice ${practiceName}.`
          : `You have ${balanceLabel}, and practice ${practiceName} isn’t available yet.${canBuy ? ' Tap Sell High above to switch to Buy Low.' : ''}`);

  return (
    <Screen
      header={
        <View>
          <Header title={asset.name} onBack={() => (step > 0 ? goTo((step - 1) as Step) : router.back())} />
          <View style={{ paddingHorizontal: space.lg, gap: 6, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
            <T v="label">
              Step {step + 1} of 3 · {STEP_TITLES[step]}
            </T>
            <ProgressBar value={(step + 1) / 3} color={GOAL_COLOR[goal]} height={10} />
            <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 2 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={canBuy ? `${GOAL_LABEL[goal]}. Tap to switch to ${GOAL_LABEL[goal === 'sell' ? 'buy' : 'sell']}` : GOAL_LABEL[goal]}
                onPress={switchGoal}
                disabled={!canBuy}
                style={[styles.pill, { backgroundColor: GOAL_COLOR[goal], borderColor: GOAL_COLOR[goal] }]}>
                <Icon name={goal === 'sell' ? 'up' : 'down'} size={14} color="#fff" />
                <T v="smallBold" color="#fff">
                  {GOAL_LABEL[goal]}
                </T>
                {canBuy ? (
                  <T v="tiny" color="#fff">
                    ⇄
                  </T>
                ) : null}
              </Pressable>
              <SummaryPill label={end ? fmtDay(end.ts) : 'End date'} active={step === 0} done={!!end && step > 0} onPress={() => goTo(0)} />
              <SummaryPill
                label={target && step > 0 ? fmtPrice(target.target) : 'Target'}
                active={step === 1}
                done={!!target && step > 1}
                onPress={end ? () => goTo(1) : undefined}
              />
              {preview ? <Badge label={`Preview · you hold 0 ${asset.ticker}`} color={colors.warnSoft} fg={colors.warn} /> : null}
            </Row>
          </View>
        </View>
      }
      footer={
        <View style={{ gap: space.sm }}>
          {step === 2 && math && !blocked ? (
            <T v="small" center color={colors.ink}>
              You lock {goal === 'sell' ? `${fmtUnits(amount, asset.symbol)} ${asset.ticker}` : fmtUsd(amount)} · get about{' '}
              <T v="smallBold" color={colors.earn}>
                {fmtUsd(math.pay)}
              </T>{' '}
              today
            </T>
          ) : null}
          {blocked ? (
            <T v="smallBold" center color={step === 2 ? colors.danger : colors.muted}>
              {blocked}
            </T>
          ) : null}
          {getPractice ? (
            <Button title={`Get practice ${practiceName}`} icon="gift" onPress={() => router.push({ pathname: '/practice', params: { resume: '1' } })} />
          ) : (
            <Button title={step === 2 ? 'Review deal' : 'Next'} disabled={!!blocked} onPress={next} />
          )}
        </View>
      }>
      <Gap h={space.md} />

      {notice ? (
        <Card color={colors.warnSoft} style={{ marginBottom: space.md }}>
          <Row gap={space.sm}>
            <Icon name="clock" />
            <T v="small" color={colors.ink} style={{ flex: 1 }}>
              {notice}
            </T>
          </Row>
        </Card>
      ) : null}

      {step === 0 ? (
        <>
          <SproutSays mood="thinking" size={76}>
            <T v="small" color={colors.ink}>
              When should your <T v="smallBold">{GOAL_LABEL[goal]}</T> deal end? Your {goal === 'sell' ? asset.ticker : 'money'} stays locked until then. About a month is a
              good start.
            </T>
          </SproutSays>
          <Gap />
          {dates.length === 0 ? (
            <Card>
              <T v="body">{loading ? 'Loading live dates…' : error ? 'Offers are unavailable right now. Please try again in a moment.' : 'No dates available right now.'}</T>
            </Card>
          ) : null}
          <View style={{ gap: space.sm }}>
            {shownDates.map((d) => {
              const sel = d.ts === endTs;
              const est = suggestedTarget(targetsOf(goal, board, d.ts));
              return (
                <Pressable
                  key={d.ts}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    tap();
                    setNotice(null);
                    setPickedEnd(d.ts);
                    setTargetPrice(null);
                  }}
                  style={[styles.option, sel ? [{ backgroundColor: colors.blueSoft }, sticker(3)] : null]}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyBold">
                      {fmtDay(d.ts)} · {d.days} days
                    </T>
                    <T v="tiny">Ends {fmtTime(d.ts)} your time</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="tiny">get about</T>
                    <T v="smallBold" color={colors.earn}>
                      {fmtUsd(est?.pct ?? 0)}
                    </T>
                    <T v="tiny">per $100</T>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {!showAll ? (
            <Pressable accessibilityRole="button" onPress={() => setAllDates(true)} style={{ alignSelf: 'center', padding: space.md }}>
              <T v="smallBold" color={colors.blue}>
                More dates ({dates.length - shownDates.length})
              </T>
            </Pressable>
          ) : (
            <Gap />
          )}
          <T v="tiny" center>
            Longer deals pay more in total, but lock your {goal === 'sell' ? asset.ticker : 'money'} for longer.
          </T>
        </>
      ) : null}

      {step === 1 && end ? (
        <>
          <SproutSays mood="happy" size={76}>
            <T v="small" color={colors.ink}>
              Pick the price you’d happily <T v="smallBold">{goal === 'sell' ? 'sell' : 'buy'}</T> {asset.name} at on {fmtDay(end.ts)}. Closer targets pay more, because the trade is
              more likely.
            </T>
          </SproutSays>
          <Gap />
          {targets.length === 0 && board ? (
            <Card style={{ marginBottom: space.sm }}>
              <T v="body">No offers for this date.</T>
              <Gap h={space.sm} />
              <Button small kind="secondary" title="Pick another date" onPress={() => goTo(0)} />
            </Card>
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="small">
              <Term id="todays-price" />: <T v="smallBold">{fmtPrice(asset.price)}</T>
            </T>
            <InfoDot id="target-price" />
          </Row>
          <Gap h={space.sm} />
          <View style={{ gap: space.sm }}>
            {targets.map((t, i) => {
              const sel = t.target === target?.target;
              const intensity = 1 - i / Math.max(1, targets.length);
              return (
                <Pressable
                  key={t.target}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    tap();
                    setNotice(null);
                    setTargetPrice(t.target);
                  }}
                  style={[styles.option, sel ? [{ backgroundColor: colors.blueSoft }, sticker(3)] : null]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={6}>
                      <T v="h3">{fmtPrice(t.target)}</T>
                      <T v="tiny">
                        {fmtSignedPct(t.moneyness)} {goal === 'sell' ? 'above' : 'below'} today
                      </T>
                    </Row>
                    <View style={styles.intensityTrack}>
                      <View style={{ width: `${25 + intensity * 75}%`, height: '100%', backgroundColor: colors.blue, opacity: 0.35 + intensity * 0.65, borderRadius: 4 }} />
                    </View>
                    {goal === 'sell' && i === targets.length - 1 ? <T v="tiny">Most likely to keep your {asset.ticker}</T> : null}
                    {goal === 'buy' && i === targets.length - 1 ? <T v="tiny">Most likely to get your money back</T> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="tiny">get about</T>
                    <T v="bodyBold" color={colors.earn}>
                      {fmtUsd(t.pct)}
                    </T>
                    <T v="tiny">per $100</T>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {targets.length > 0 ? (
            <>
              <Gap h={space.sm} />
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="tiny">More pay · more likely to trade</T>
                <T v="tiny">Less pay · less likely</T>
              </Row>
            </>
          ) : null}
        </>
      ) : null}

      {step === 2 && target ? (
        <>
          <SproutSays mood="determined" size={76}>
            <T v="small" color={colors.ink}>
              {goal === 'sell'
                ? `How much ${asset.name} would you like to lock? Only lock what you’d be happy to sell at ${fmtPrice(target.target)}.`
                : `How many dollars would you like to set aside? Only use money you’d be happy to spend on ${asset.name} at ${fmtPrice(target.target)}.`}
            </T>
          </SproutSays>
          <Gap />
          <Card>
            <T v="label">
              <Term id="what-you-lock" />
            </T>
            <Row gap={space.sm} style={{ marginTop: space.sm }}>
              {goal === 'buy' ? <T v="h1">$</T> : null}
              <TextInput
                value={amountText}
                onChangeText={(v) => setAmountText(v.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                accessibilityLabel="Amount"
                selectTextOnFocus
              />
              {goal === 'sell' ? <T v="h2">{asset.ticker}</T> : null}
            </Row>
            <T v="small">
              {goal === 'sell' ? `≈ ${fmtUsd(amount * asset.price)} today · ` : ''}
              {goal === 'sell' && asset.symbol === 'SOL' ? 'Free to lock' : 'Practice balance'}: {state.wallet ? balanceLabel : '—'}
              {goal === 'sell' && asset.symbol === 'SOL' && state.wallet ? ` (${SOL_FEE_RESERVE} SOL kept for network fees)` : ''}
            </T>
            {state.wallet && balance > 0 ? (
              <Row gap={space.sm} style={{ flexWrap: 'wrap', marginTop: space.md }}>
                {presets.map((p) => (
                  <Chip key={p.label} label={p.label} onPress={() => setAmountText(String(p.value))} />
                ))}
              </Row>
            ) : null}
            {amountError ? (
              <T v="smallBold" color={colors.danger} style={{ marginTop: space.sm }}>
                {amountError}
              </T>
            ) : null}
          </Card>

          {!state.wallet || (overBalance && practiceOk) ? (
            <Card color={colors.warnSoft} style={{ marginTop: space.md }} onPress={() => (state.wallet ? router.push({ pathname: '/practice', params: { resume: '1' } }) : router.push('/sign-in'))}>
              <Row gap={space.sm}>
                <Icon name="wallet" />
                <T v="small" color={colors.ink} style={{ flex: 1 }}>
                  {!state.wallet
                    ? 'You’ll need a free wallet with practice money. Tap to set one up. It takes 10 seconds.'
                    : `That’s more than you have (${balanceLabel}). Tap to get free practice ${practiceName}.`}
                </T>
                <Icon name="chevron" />
              </Row>
            </Card>
          ) : null}

          {math ? (
            <Card style={{ marginTop: space.md }} color={colors.cream}>
              <SummaryLine label="You lock" value={goal === 'sell' ? `${fmtUnits(amount, asset.symbol)} ${asset.ticker}` : fmtUsd(amount)} />
              <SummaryLine label="Paid to you today (about)" value={fmtUsd(math.pay)} strong />
              <SummaryLine
                label={goal === 'sell' ? 'If it sells, you get' : 'If it buys, you get'}
                value={goal === 'sell' ? fmtUsd(math.ifSwapGet) : `${fmtUnits(math.ifSwapGet, asset.symbol)} ${asset.ticker}`}
              />
              <SummaryLine label="Ends" value={end ? `${fmtDay(end.ts)} · ${fmtTime(end.ts)}` : '—'} />
            </Card>
          ) : null}
          <T v="tiny" center style={{ marginTop: space.sm }}>
            {unit === '$' ? 'Digital dollars (USDC).' : ''} One deal can be up to {fmtUsd(LIMITS.maxDealUsd)} for now.
          </T>
        </>
      ) : null}
    </Screen>
  );
}

function SummaryPill({ label, active, done, onPress }: { label: string; active: boolean; done: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: active ? colors.blueSoft : colors.paper, borderColor: active ? colors.navy : colors.border }]}>
      {done ? <Icon name="check" size={12} color={colors.sproutDark} /> : null}
      <T v="smallBold" color={done || active ? colors.ink : colors.faint}>
        {label}
      </T>
    </Pressable>
  );
}

function SummaryLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <T v="small">{label}</T>
      <T v={strong ? 'bodyBold' : 'smallBold'} color={strong ? colors.earn : colors.ink}>
        {value}
      </T>
    </Row>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.navy,
    padding: space.md,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 2 },
  intensityTrack: { height: 8, borderRadius: 4, backgroundColor: '#EAF1F8', overflow: 'hidden', marginTop: 4, maxWidth: 140 },
  amountInput: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.navy,
    paddingVertical: 4,
    minWidth: 60,
  },
});
