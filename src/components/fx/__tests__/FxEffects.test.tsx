import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { BeamFan, FlashLayer, OrbitParticles, ShockRing, SparkBurst } from '../FxEffects';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const OPTIONS = { count: 12, colors: ['#ff0000', '#ffffff'], dist: 48, size: 5, r0: 56 };
const HITS = [{ t: 1, dur: 0.2, peak: 0.6 }];

function Harness() {
  const clock = useSharedValue(1.2);
  return (
    <View>
      <SparkBurst clock={clock} t0={1} cx={80} cy={80} options={OPTIONS} />
      <OrbitParticles clock={clock} t0={1} t1={3} cx={80} cy={80} rx={86} ry={26} speed={2} count={12} colors={['#a98bff']} />
      <BeamFan clock={clock} t0={1.2} outFrom={2.5} outTo={3.4} cx={80} cy={80} length={120} count={12} colors={['#8E6BFF', '#FF4A3D', '#FF6B2C']} />
      <ShockRing clock={clock} t0={1} dur={0.7} cx={80} cy={80} size={120} from={0.7} to={2.5} color="#F0524A" />
      <FlashLayer clock={clock} hits={HITS} />
    </View>
  );
}

describe('FxEffects', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => { act(() => r?.unmount()); });

  it('mounts every effect layer with the designed element counts', () => {
    act(() => { r = create(<Harness />); });
    const views = r!.root.findAllByType(View);
    // 12 sparks + 12 orbit dots + 12 beams, plus their containers.
    expect(views.length).toBeGreaterThanOrEqual(36);
  });
});
