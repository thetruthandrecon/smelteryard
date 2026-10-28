import { LEVEL } from '../core/world.js';
import { box, dynBox, crusher, capsule, checkpoint, sign } from './builders.js';
import { addEnt } from '../enemies/enemies.js';

// The Test Yard: the practice course from milestones 1 to 4
export function defineTestYard() {
  box(-12, 12, -1, 0, -10, 12);
  box(3, 5, 0, 1, 2, 4, 'crate');
  box(-6.5, -4.5, 0, 1.6, -1, 1, 'crate');
  box(7, 9, 0, 7, -7, -5, 'wall');
  box(9.5, 11.5, 0, 1.2, -9.5, -7.5, 'wall');
  box(-3, 3, 0, 0.35, -4, -5, 'spike');
  box(-2.5, 2.5, -1, 0, -13, -17);
  box(-2.5, 2.5, -1, 0.6, -20.5, -24.5);
  box(-2.5, 2.5, -1, 1.2, -28.5, -33);
  box(-4, 4, -1, 1.2, -41, -52);
  box(5, 6.5, -1, 2.4, -46.5, -48, 'wall');
  box(-1.6, 1.6, -1, 1.2, -52, -55);
  box(-3.2, -1.6, -1, 12.6, -52, -56, 'wall');
  box(1.6, 3.2, -1, 12.6, -52, -56, 'wall');
  box(-1.6, 1.6, -1, 11, -55, -56, 'wall');
  box(-4, 4, 9, 11, -56, -66);
  box(-4, 4, 11, 11.35, -59, -60, 'spike');
  box(-4, 4, 9, 11, -78, -88);
  LEVEL.named.MP1 = dynBox('platform', 1.5, 0.3, 1.5, { path: (t) => [0, 10.7, -93.5 + 3 * Math.sin((t * 2 * Math.PI) / 5)] });
  LEVEL.named.MP2 = dynBox('platform', 1.5, 0.3, 1.5, { path: (t) => [0, 10.7 + 1.6 * Math.sin((t * 2 * Math.PI) / 4.5), -101] });
  box(-4, 4, 9, 11, -103, -121);
  crusher(-107, 0, 11); crusher(-111.5, 1.3, 11); crusher(-116, 2.6, 11);
  box(-3, 3, 9, 19, -121, -125, 'wall');
  checkpoint(0, 0, 8); checkpoint(0, 1.2, -44); checkpoint(0, 11, -57.6); checkpoint(0, 11, -82); checkpoint(0, 11, -104.5);
  LEVEL.goal = { kind: 'beacon', x: 0, y: 19, z: -123, xHalf: 3.4, zMin: -125.4, zMax: -120.6 };
  LEVEL.path = [12, -125];
  sign('SHOOTING RANGE', -8.5, 3.6, 10.5); sign('HOP THE SPIKES', 5.5, 2.6, -4.5); sign('JUMP THE GAPS', 6.5, 3.4, -14);
  sign('WALL-JUMP PRACTICE', 8, 8.6, -6); sign('DASH JUMP', 6, 4.2, -32); sign('WALL SHAFT', 6.5, 5, -50);
  sign('DASH JUMP + AIR DASH', 7, 14, -65); sign('RIDE THE PLATFORMS', 6.5, 14.5, -87); sign('TIME THE CRUSHERS', 6.5, 15.5, -104); sign('WALL CLIMB', 6.5, 15.5, -119.5);
  addEnt('dummy', -9.5, 0, 6); addEnt('dummy', -10.5, 0, 2.5); addEnt('dummy', -9, 0, -1.5); addEnt('dummy', -10.5, 0, -5);
  addEnt('mover', -7.5, 0.7, 0, { zMin: -6, zMax: 7, speed: 2.5 });
  addEnt('turret', 10.5, 1.2, -8.5, { range: 15, yaw: Math.PI / 2 });
  addEnt('turret', 5.75, 2.4, -47.25, { range: 15, yaw: Math.PI / 2 });
  addEnt('walker', -3, 0, -1.2, { axis: 0, min: -3, max: 3 });
  addEnt('flyer', 6, 3.4, -3, { range: 11 });
  addEnt('flyer', 3.5, 4.2, -26, { range: 11 });
  addEnt('walker', -3.2, 1.2, -47, { axis: 0, min: -3.2, max: 3.2 });
  addEnt('walker', -3.2, 11, -62.5, { axis: 0, min: -3.2, max: 3.2 });
  addEnt('flyer', 3.5, 14.5, -95, { range: 11 });
  addEnt('walker', -3.2, 11, -119.2, { axis: 0, min: -3.2, max: 3.2 });
  capsule(-3.5, 0, 5.5); capsule(3, 1.2, -45); capsule(-2.5, 11, -80); capsule(3, 11, -104);
}
