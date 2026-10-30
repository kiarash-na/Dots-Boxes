// ─── Runtime validation of client messages — the security boundary ─────────
// Lives in server/src (not src/shared) so `zod` always resolves from the
// server's own node_modules, no matter which directory the build runs from.

import { z } from 'zod';
import { BOXES, DOTS } from '../../src/game/engine';
import type { ClientMessage } from '../../src/shared/protocol';

// Edge coordinates bounded by the board: horizontal edges live in a
// DOTS × BOXES grid, vertical edges in a BOXES × DOTS grid.
const edgeSchema = z.discriminatedUnion('orientation', [
  z.object({
    orientation: z.literal('h'),
    row: z.number().int().min(0).max(DOTS - 1),
    col: z.number().int().min(0).max(BOXES - 1),
  }),
  z.object({
    orientation: z.literal('v'),
    row: z.number().int().min(0).max(BOXES - 1),
    col: z.number().int().min(0).max(DOTS - 1),
  }),
]);

export const clientMessageSchema: z.ZodType<ClientMessage> = z.discriminatedUnion('t', [
  z.object({ t: z.literal('enqueue') }),
  z.object({ t: z.literal('dequeue') }),
  z.object({ t: z.literal('offer_response'), accept: z.boolean() }),
  z.object({ t: z.literal('move'), edge: edgeSchema }),
  z.object({ t: z.literal('sync') }),
  z.object({ t: z.literal('rematch') }),
  z.object({ t: z.literal('leave_match') }),
]);
