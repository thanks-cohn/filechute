import idle from "./assets/idle/animation.js";
import happy from "./assets/happy/animation.js";
import curious from "./assets/curious/animation.js";
import hop from "./assets/hop/animation.js";
import chomp from "./assets/chomp/animation.js";
import ready from "./assets/ready/animation.js";
import eating from "./assets/eating/animation.js";
import success from "./assets/success/animation.js";
import failure from "./assets/failure/animation.js";

export const CHUTTY_ANIMATIONS = Object.freeze([
  idle,
  happy,
  curious,
  hop,
  chomp,
  ready,
  eating,
  success,
  failure
]);

export const DEFAULT_CYCLE_ORDER = Object.freeze(
  CHUTTY_ANIMATIONS.filter((animation) => animation.cycle).map((animation) => animation.id)
);

export function animationById(id) {
  return CHUTTY_ANIMATIONS.find((animation) => animation.id === id) || null;
}
