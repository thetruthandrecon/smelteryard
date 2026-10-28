// The levels in the game. The first one is the default.
import { registerLevel } from './builders.js';
import { defineSmelter } from './smelter.js';
import { defineTestYard } from './test-yard.js';

registerLevel('smelter', 'Smelter Yard', defineSmelter);
registerLevel('yard', 'Test Yard', defineTestYard);
