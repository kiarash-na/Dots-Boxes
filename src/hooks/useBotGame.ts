// ─── Casual bot game while waiting in the online queue ─────────────────────
// Human is always Red (side 0), the bot is Blue. Purely client-side — it is
// discarded as soon as a human match starts.

import { useCallback, useEffect, useState } from 'react';
import { chooseMove } from '../game/bot';
import type { Difficulty } from '../game/bot';
import { applyMove, newGame } from '../game/engine';
import type { Edge, GameState } from '../game/engine';

export function useBotGame(difficulty: Difficulty) {
  const [state, setState] = useState<GameState>(newGame);

  const move = useCallback((e: Edge) => {
    setState((s) => (s.current === 1 ? s : (applyMove(s, e)?.next ?? s)));
  }, []);

  const reset = useCallback(() => setState(newGame()), []);

  const botTurn = !state.over && state.current === 1;

  // One move per timer so capture chains play out visibly.
  useEffect(() => {
    if (!botTurn) return;
    const t = setTimeout(
      () => {
        setState((s) =>
          s.over || s.current !== 1 ? s : (applyMove(s, chooseMove(s, difficulty))?.next ?? s)
        );
      },
      450 + Math.random() * 300
    );
    return () => clearTimeout(t);
  }, [botTurn, difficulty, state]);

  return { state, move, reset, botTurn };
}
