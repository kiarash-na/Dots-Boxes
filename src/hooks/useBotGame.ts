// ─── Casual bot game while waiting in the online queue ─────────────────────
// By default the human is Red (side 0) and the bot Blue. `resume` lets the
// bot take over an abandoned online game from its current position, on the
// side the departed opponent played. Purely client-side.

import { useCallback, useEffect, useState } from 'react';
import { chooseMove } from '../game/bot';
import type { Difficulty } from '../game/bot';
import { applyMove, newGame } from '../game/engine';
import type { Edge, GameState, PlayerId } from '../game/engine';

export function useBotGame(difficulty: Difficulty) {
  const [state, setState] = useState<GameState>(newGame);
  const [botSide, setBotSide] = useState<PlayerId>(1);

  const move = useCallback(
    (e: Edge) => {
      setState((s) => (s.current === botSide ? s : (applyMove(s, e)?.next ?? s)));
    },
    [botSide]
  );

  const reset = useCallback(() => {
    setBotSide(1);
    setState(newGame());
  }, []);

  /** Continue from `from` with the bot playing `side`. */
  const resume = useCallback((from: GameState, side: PlayerId) => {
    setBotSide(side);
    setState(from.over ? newGame() : from);
  }, []);

  const botTurn = !state.over && state.current === botSide;

  // One move per timer so capture chains play out visibly.
  useEffect(() => {
    if (!botTurn) return;
    const t = setTimeout(
      () => {
        setState((s) =>
          s.over || s.current !== botSide
            ? s
            : (applyMove(s, chooseMove(s, difficulty))?.next ?? s)
        );
      },
      450 + Math.random() * 300
    );
    return () => clearTimeout(t);
  }, [botTurn, botSide, difficulty, state]);

  return { state, move, reset, resume, botTurn, botSide };
}
