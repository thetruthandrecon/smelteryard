import { LEVEL, DECO } from '../core/world.js';
import { box, dynBox, crusher, capsule, checkpoint, sign } from './builders.js';
import { addEnt } from '../enemies/enemies.js';

// Smelter Yard: the full stage
export function defineSmelter() {
  // 1. Intro run through the yard (floor top 0)
  box(-7, 7, -1, 6, 12, 13, 'wall');
  box(-6, 6, -1, 0, 12, -14);
  box(-7, -6, -1, 3, 12, -14, 'wall'); box(6, 7, -1, 3, 12, -14, 'wall');
  box(-6, 6, -1, 0, -18, -34);                                    // after a 4 m lava pit
  box(-7, -6, -1, 3, -18, -34, 'wall');
  box(6, 7, -1, 3, -18, -29, 'wall'); box(6, 8.5, -1, 3.2, -29, -33, 'wall'); box(6, 7, -1, 3, -33, -34, 'wall');
  box(2.5, 4.5, 0, 1.2, -26, -28, 'crate');
  box(-4.5, -2.5, 0, 1.2, -30.5, -32.5, 'crate');
  box(-6, 6, -1, 0, -42, -58);                                    // after an 8 m dash-jump pit
  box(-7, -6, -1, 3, -42, -58, 'wall'); box(6, 7, -1, 3, -42, -58, 'wall');
  box(-6, 6, 0, 0.35, -47, -48, 'spike');
  box(-6, 6, -1, 1.6, -58, -74);                                  // step up to the furnace
  box(-7, -6, -1, 4.6, -58, -74, 'wall'); box(6, 7, -1, 4.6, -58, -74, 'wall');
  // 2. Furnace shaft. Part A: zig-zag between the walls, then step out onto the ledge
  box(-1.6, 1.6, -1, 1.6, -74, -78);
  box(-3.2, -1.6, -1, 12, -74, -79, 'wall'); box(1.6, 3.2, -1, 12, -74, -79, 'wall');
  box(-1.6, 1.6, -1, 10.4, -78, -79, 'wall');
  box(-4, 4, 8.4, 10.4, -79, -86);
  // Part B: the taller chimney up to the crusher hall
  box(-1.6, 1.6, 8.4, 10.4, -86, -90);
  box(-3.2, -1.6, 8.4, 26.6, -86, -91, 'wall'); box(1.6, 3.2, 8.4, 26.6, -86, -91, 'wall');
  box(-1.6, 1.6, 8.4, 25, -90, -91, 'wall');
  // 3. Crusher hall (floor top 25), with turrets on the side walls
  box(-4, 4, 23, 25, -91, -150);
  box(-6, -4, 23, 29, -104.5, -111, 'wall');
  box(4, 6, 23, 29, -121.5, -127, 'wall');
  crusher(-98, 0, 25); crusher(-104, 1.0, 25); crusher(-112, 2.0, 25); crusher(-120, 0.6, 25); crusher(-128, 1.6, 25);
  box(-4, 4, 25, 25.35, -115.5, -116.5, 'spike');
  // 4. Lava conveyor: a belt that drags you toward the edge, then three moving platforms up to the boss ledge
  LEVEL.named.belt = box(-4, 4, 23, 25, -150, -166, 'belt', { belt: [3.5, 0] });
  // all three share a 5 s cycle: A reaches its far end as B swings through the middle, and C is at its lowest on B's next pass
  const W = (2 * Math.PI) / 5;
  LEVEL.named.MPA = dynBox('platform', 1.5, 0.3, 1.5, { path: (t) => [0, 24.7, -173 + 3.5 * Math.cos(W * t)] });
  LEVEL.named.MPB = dynBox('platform', 1.5, 0.3, 1.5, { path: (t) => [2.5 * Math.sin(W * (t - 2.95)), 24.7, -181] });
  LEVEL.named.MPC = dynBox('platform', 1.5, 0.3, 1.5, { path: (t) => [0, 26.7 - 2 * Math.cos(W * (t - 0.6)), -186.5] });
  box(-5, 5, 26, 28, -188.5, -216);
  box(-6, -5, 26, 31, -188.5, -216, 'wall'); box(5, 6, 26, 31, -188.5, -216, 'wall');
  box(-5, -2, 28, 35, -214, -216, 'wall'); box(2, 5, 28, 35, -214, -216, 'wall'); box(-2, 2, 33, 35, -214, -216, 'wall');
  const bossDoor = box(-2, 2, 28, 33, -214.6, -215.4, 'door');
  bossDoor.closedMin = bossDoor.min.slice(); bossDoor.closedMax = bossDoor.max.slice();
  bossDoor.open = 0; bossDoor.triggered = false; bossDoor.openedAt = 0;
  LEVEL.named.bossDoor = bossDoor;
  // The arena starts just beyond the door. Keep the approach floor continuous with the room.
  box(-5, 5, 26, 28, -216, -246);
  box(-6, -5, 28, 37, -216, -246, 'wall'); box(5, 6, 28, 37, -216, -246, 'wall');
  box(-6, 6, 28, 37, -245, -246, 'wall');
  box(-6, 6, 37, 39, -216, -246, 'wall');
  checkpoint(0, 0, 6); checkpoint(0, 25, -93.5); checkpoint(0, 25, -146); checkpoint(0, 28, -192);
  LEVEL.goal = { kind: 'door', x: 0, y: 28, z: -213, xHalf: 2.6, zMin: -214.7, zMax: -211.8, triggerZ: -211 };
  LEVEL.path = [12, -246];
  sign('SMELTER YARD', 0, 6.2, -13); sign('FURNACE SHAFT', 5.2, 6.5, -71); sign('CRUSHER HALL', 5.6, 28.5, -95);
  sign('LAVA CONVEYOR', 5.6, 28.5, -149); sign('BOSS', 0, 36.2, -213.6);
  addEnt('walker', -4.5, 0, -23, { axis: 0, min: -4.5, max: 4.5 });
  addEnt('turret', 7.25, 3.2, -31, { range: 15, yaw: Math.PI / 2 });
  addEnt('walker', 4.5, 0, -53, { axis: 0, min: -4.5, max: 4.5, dir: -1 });
  addEnt('flyer', 2.5, 4.2, -51, { range: 11 });
  addEnt('flyer', 0, 19, -82.5, { range: 11 });
  addEnt('turret', -5, 29, -107.75, { range: 16, yaw: -Math.PI / 2 });
  addEnt('turret', 5, 29, -124.25, { range: 16, yaw: Math.PI / 2 });
  addEnt('walker', -3.4, 25, -138, { axis: 0, min: -3.4, max: 3.4 });
  addEnt('flyer', 3, 31, -203, { range: 11 });
  addEnt('walker', -4, 28, -201, { axis: 0, min: -4, max: 4 });
  addEnt('boss', 0, 28, -241, { entryZ: -231, entrySpeed: 3.4, introDuration: 2.4, chargeFrontZ: -218, chargeBackZ: -243.8, chargeMinX: -3.55, chargeMaxX: 3.55 });
  capsule(-4, 0, -44); capsule(0, 10.4, -82.5); capsule(3, 25, -140); capsule(-3, 28, -196);
  // set dressing (no collision): pipes along the yard walls, molten vats beside the hall
  for (const [x, z0, z1] of [[-6.6, 12, -14], [6.6, 12, -14], [-6.6, -18, -34], [6.6, -18, -28.6], [-6.6, -42, -74], [6.6, -42, -74]]) DECO.push({ kind: 'pipe', x, y: 3.6, z0, z1 });
  for (const [x, z] of [[-13, -100], [13, -112], [-13, -132], [13, -140], [-14, -172], [14, -200]]) DECO.push({ kind: 'vat', x, y: 26, z });
}
