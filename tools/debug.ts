import { TrackData } from '../src/track/TrackDef';
import { Vehicle, EMPTY_INPUT } from '../src/car/Vehicle';
import { CAR_SPECS, TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH, PHYSICS_DT } from '../src/config';

const track = new TrackData(TRACK_POINTS, TRACK_SAMPLE_COUNT, ROAD_HALF, CURB_WIDTH);
console.log('length', track.length.toFixed(1), 'ds', track.ds.toFixed(3), 'bounds', track.minX.toFixed(0), track.maxX.toFixed(0), track.minZ.toFixed(0), track.maxZ.toFixed(0));

const v = new Vehicle(CAR_SPECS[1]);
v.respawn(track, 60, 0);
console.log('respawn pos', v.pos, 'heading', v.heading.toFixed(3));
const c0 = track.closest(v.pos.x, v.pos.z);
console.log('closest at spawn: s', c0.s.toFixed(2), 'lat', c0.lateral.toFixed(3), 'limit', track.wallLateral());

for (let i = 0; i < 12; i++) {
  const r = v.step(PHYSICS_DT, { ...EMPTY_INPUT, throttle: 1 }, track);
  if (i % 2 === 0 || i < 6)
    console.log(
      `t=${((i + 1) * PHYSICS_DT).toFixed(3)} vf=${v.forwardSpeed.toFixed(2)} speed=${v.speed.toFixed(2)} pos=(${v.pos.x.toFixed(1)},${v.pos.z.toFixed(1)}) lat=${r.lateral.toFixed(2)} s=${r.s.toFixed(1)} wall=${r.wallHit.toFixed(2)} head=${v.heading.toFixed(3)} offroad=${r.offroad}`
    );
}
for (let i = 0; i < 600; i++) v.step(PHYSICS_DT, { ...EMPTY_INPUT, throttle: 1 }, track);
console.log('after 5s: speed kmh', v.speedKmh.toFixed(1), 'pos', v.pos.x.toFixed(1), v.pos.z.toFixed(1), 'lat', v.last.lateral.toFixed(2), 's', v.last.s.toFixed(1), 'wall', v.last.wallHit);
