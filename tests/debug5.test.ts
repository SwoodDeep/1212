import { it } from 'vitest';
import { TrackData } from '../src/track/TrackDef';
import { Vehicle, EMPTY_INPUT } from '../src/car/Vehicle';
import { CAR_SPECS, TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH, PHYSICS_DT } from '../src/config';

it('grid start accel', () => {
  const track = new TrackData(TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH);
  const v = new Vehicle(CAR_SPECS[1]);
  const L = track.length;
  v.respawn(track, L - 26, -2.4);
  console.log('start pos', v.pos, 'heading', v.heading.toFixed(3), 'c', track.closest(v.pos.x, v.pos.z).s.toFixed(1), track.closest(v.pos.x, v.pos.z).lateral.toFixed(2));
  for (let i = 0; i < 360; i++) {
    const r = v.step(PHYSICS_DT, { ...EMPTY_INPUT, throttle: 1 }, track);
    if (i % 60 === 0) console.log(`t=${(i * PHYSICS_DT).toFixed(1)} vf=${v.forwardSpeed.toFixed(1)} kmh=${v.speedKmh.toFixed(0)} s=${r.s.toFixed(1)} lat=${r.lateral.toFixed(2)} wall=${r.wallHit.toFixed(1)} off=${r.offroad} head=${v.heading.toFixed(2)}`);
  }
});
