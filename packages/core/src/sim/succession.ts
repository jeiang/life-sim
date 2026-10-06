import type { PersonId, World } from "../state/types.ts";
import { getPerson } from "../state/world.ts";
import { appendChoice } from "./flow.ts";

/**
 * Succession (ADR 0003, generations): move the player pointer to a living heir. The
 * generation index rises by one, so the heir's RNG streams differ from every earlier
 * generation's; `worldYear` is untouched. Per-life state resets: `storyletLog` and the
 * roll-site counters. Clearing `ended` and the graveyard/obituary hand-off belong to the
 * caller (the dynasty flow). Logged, so replay reproduces it.
 */
export function succeed(world: World, heir: PersonId): World {
  if (heir === world.playerId)
    throw new RangeError("the heir is already the player");
  if (!getPerson(world, heir).alive)
    throw new RangeError(`heir ${heir} is not alive`);
  return appendChoice(
    {
      ...world,
      playerId: heir,
      generation: world.generation + 1,
      storyletLog: {},
      rngCounters: {},
      uses: {},
    },
    { t: "succeed", heir },
  );
}
