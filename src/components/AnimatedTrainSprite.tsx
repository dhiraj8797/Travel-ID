import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

const COACH_COUNT = 6;

type Props = {
  width: number;
  height: number;
  style?: ViewStyle;
};

/**
 * Side-view train: driving cab at both ends + 6 passenger coaches (Vande Bharat style).
 */
export function AnimatedTrainSprite({ width, height, style }: Props) {
  const unitH = height;
  const coachW = width / (COACH_COUNT + 2.7);
  const engineW = coachW * 1.35;
  const gap = Math.max(2, coachW * 0.04);

  return (
    <View style={[styles.row, { width, height: unitH }, style]}>
      {/* Rear cab (left) — nose faces left */}
      <Engine width={engineW} height={unitH} facing="left" />
      <Coupler height={unitH * 0.5} />

      {Array.from({ length: COACH_COUNT }).map((_, i) => (
        <React.Fragment key={`coach-${i}`}>
          <Coach width={coachW - gap} height={unitH * 0.88} />
          {i < COACH_COUNT - 1 ? <Coupler height={unitH * 0.5} /> : null}
        </React.Fragment>
      ))}

      <Coupler height={unitH * 0.5} />
      {/* Lead cab (right) — nose faces right (train moves →) */}
      <Engine width={engineW} height={unitH} facing="right" />
    </View>
  );
}

function Coupler({ height }: { height: number }) {
  return (
    <View
      style={[
        styles.coupler,
        { height, width: 5, borderRadius: 2, marginHorizontal: 1 },
      ]}
    />
  );
}

function Coach({ width, height }: { width: number; height: number }) {
  const windowCount = 5;
  return (
    <View style={[styles.coach, { width, height, borderRadius: height * 0.12 }]}>
      <View style={styles.stripeTop} />
      <View style={styles.windowRow}>
        {Array.from({ length: windowCount }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.window,
              {
                width: (width - 16) / windowCount - 3,
                height: height * 0.28,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.stripeSaffron} />
      <View style={styles.doorL} />
      <View style={styles.doorR} />
      <Bogies width={width} />
    </View>
  );
}

function Engine({
  width,
  height,
  facing,
}: {
  width: number;
  height: number;
  facing: 'left' | 'right';
}) {
  const noseRight = facing === 'right';
  return (
    <View
      style={[
        styles.engineWrap,
        { width, height, flexDirection: noseRight ? 'row' : 'row-reverse' },
      ]}
    >
      <View
        style={[
          styles.engineBody,
          { height: height * 0.88, borderRadius: height * 0.12 },
        ]}
      >
        <View style={styles.stripeTop} />
        <View
          style={[
            styles.cabWindow,
            noseRight ? styles.cabWindowRight : styles.cabWindowLeft,
          ]}
        />
        <View style={styles.stripeSaffron} />
        <View style={noseRight ? styles.doorL : styles.doorR} />
      </View>
      <View
        style={[
          styles.nose,
          { height: height * 0.72 },
          noseRight ? styles.noseRight : styles.noseLeft,
        ]}
      />
      <Bogies width={width * 0.72} />
    </View>
  );
}

function Bogies({ width }: { width: number }) {
  return (
    <View style={[styles.bogieRow, { width: width * 0.85 }]}>
      <View style={styles.bogie} />
      <View style={styles.bogie} />
    </View>
  );
}

/** Vande Bharat livery */
const Body = '#F7FAFD';
const Blue = '#1B4FBF';
const Saffron = '#F4A261';
const Glass = '#152238';
const Bogie = '#4A5568';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  coupler: {
    backgroundColor: '#222833',
    alignSelf: 'center',
    marginBottom: 10,
  },
  coach: {
    backgroundColor: Body,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
  },
  engineWrap: {
    alignItems: 'flex-end',
  },
  engineBody: {
    flex: 1,
    backgroundColor: Body,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
  },
  nose: {
    width: '28%',
    backgroundColor: Body,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  noseRight: {
    borderTopRightRadius: 40,
    borderBottomRightRadius: 10,
    marginLeft: -2,
  },
  noseLeft: {
    borderTopLeftRadius: 40,
    borderBottomLeftRadius: 10,
    marginRight: -2,
  },
  stripeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '32%',
    height: '30%',
    backgroundColor: Blue,
    opacity: 0.92,
  },
  stripeSaffron: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '20%',
    height: 2.5,
    backgroundColor: Saffron,
  },
  windowRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
    zIndex: 1,
  },
  window: {
    backgroundColor: Glass,
    borderRadius: 3,
  },
  cabWindow: {
    position: 'absolute',
    top: '28%',
    width: '42%',
    height: '36%',
    backgroundColor: Glass,
    borderRadius: 6,
    zIndex: 1,
  },
  cabWindowRight: { right: 8 },
  cabWindowLeft: { left: 8 },
  doorL: {
    position: 'absolute',
    left: 3,
    top: '22%',
    width: 7,
    height: '48%',
    backgroundColor: Blue,
    borderRadius: 2,
    zIndex: 2,
  },
  doorR: {
    position: 'absolute',
    right: 3,
    top: '22%',
    width: 7,
    height: '48%',
    backgroundColor: Blue,
    borderRadius: 2,
    zIndex: 2,
  },
  bogieRow: {
    position: 'absolute',
    bottom: -3,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bogie: {
    width: 16,
    height: 8,
    borderRadius: 3,
    backgroundColor: Bogie,
  },
});

export const TRAIN_COACH_COUNT = COACH_COUNT;
