import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import Board from '../components/Board';
import GameOver from '../components/GameOver';
import Scoreboard from '../components/Scoreboard';
import LobbyPanel from '../components/online/LobbyPanel';
import MatchOffer from '../components/online/MatchOffer';
import OpponentAway from '../components/online/OpponentAway';
import OpponentGone from '../components/online/OpponentGone';
import TurnTimer from '../components/online/TurnTimer';
import type { Difficulty } from '../game/bot';
import { BLUE, RED, applyMove, makeInitials } from '../game/engine';
import type { GameState, Player, PlayerId } from '../game/engine';
import { useBotGame } from '../hooks/useBotGame';
import { OnlineClient } from '../net/client';
import type { ConnectionStatus } from '../net/client';
import { deserializeState } from '../shared/state';
import type { LobbyPlayer } from '../shared/protocol';

type RematchState = 'none' | 'sent' | 'received';

/** A match that ended because the opponent is gone — kept for the "what now?" choice. */
interface EndedMatch {
  state: GameState;
  side: PlayerId;
  opponentName: string;
  reason: 'opponent_left' | 'opponent_disconnected';
}

const deadlineIn = (ms: number | null) => (ms === null ? null : Date.now() + ms);

function seatPlayers(selfSide: PlayerId, selfName: string, oppName: string): [Player, Player] {
  const mine = { name: selfName, initials: makeInitials(selfName) };
  const theirs = { name: oppName, initials: makeInitials(oppName) };
  return [
    { ...RED, ...(selfSide === 0 ? mine : theirs) },
    { ...BLUE, ...(selfSide === 1 ? mine : theirs) },
  ];
}

export default function Online() {
  const navigate = useNavigate();

  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [queued, setQueued] = useState(false);
  const [lobby, setLobby] = useState<LobbyPlayer[]>([]);
  const [queueInfo, setQueueInfo] = useState<{ position: number | null; size: number }>({
    position: null,
    size: 0,
  });
  const [offer, setOffer] = useState<{ opponentName: string; expiresInMs: number } | null>(null);
  const [offerPending, setOfferPending] = useState(false);
  const [match, setMatch] = useState<{ side: PlayerId; opponentName: string } | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [rematch, setRematch] = useState<RematchState>('none');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [opponentAway, setOpponentAway] = useState<number | null>(null); // grace deadline
  const [ended, setEnded] = useState<EndedMatch | null>(null);
  const [robot, setRobot] = useState(false); // bot took over an abandoned game

  const bot = useBotGame(difficulty);

  const clientRef = useRef<OnlineClient | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const matchRef = useRef<{ side: PlayerId; opponentName: string } | null>(null);
  const offlineRef = useRef(false); // choosing after a lost opponent, or playing the bot
  const resumingRef = useRef(false);
  useEffect(() => {
    gameRef.current = game;
    matchRef.current = match;
    offlineRef.current = ended !== null || robot;
  }, [game, match, ended, robot]);

  const clearMatch = useCallback(() => {
    setMatch(null);
    setGame(null);
    setRematch('none');
    setTurnDeadline(null);
    setOpponentAway(null);
  }, []);

  // ── connection lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const client = new OnlineClient();
    clientRef.current = client;
    const offStatus = client.onStatus(setConnStatus);

    const offMessage = client.onMessage((msg) => {
      switch (msg.t) {
        case 'welcome': {
          setMe({ id: msg.id, name: msg.name });
          if (msg.resumed) {
            // Our held seat was restored; match_start with the live board follows.
            resumingRef.current = true;
            if (gameRef.current) toast.success('Reconnected — your game continues.');
            break;
          }
          // Otherwise the server treats us as brand new.
          const lostMatch = gameRef.current !== null;
          clearMatch();
          setOffer(null);
          setOfferPending(false);
          if (offlineRef.current) break; // deciding what's next / playing the bot — leave it
          bot.reset();
          setQueued(true);
          client.enqueue();
          if (lostMatch) toast.error('Connection lost for too long — your match ended. Back in the queue.');
          break;
        }
        case 'lobby':
          setLobby(msg.players);
          break;
        case 'queue':
          setQueueInfo({ position: msg.position, size: msg.size });
          break;
        case 'offer':
          setOffer({ opponentName: msg.opponentName, expiresInMs: msg.expiresInMs });
          setOfferPending(false);
          break;
        case 'offer_pending':
          setOfferPending(true);
          break;
        case 'offer_cancelled':
          setOffer(null);
          setOfferPending(false);
          toast(
            msg.reason === 'declined'
              ? 'Opponent passed — you keep your spot at the front of the line.'
              : 'Offer expired — you keep your spot at the front of the line.'
          );
          break;
        case 'match_start': {
          try {
            const state = deserializeState(msg.state);
            setOffer(null);
            setOfferPending(false);
            setQueued(false);
            setEnded(null);
            setRobot(false);
            setRematch('none');
            setOpponentAway(null);
            setMatch({ side: msg.side, opponentName: msg.opponentName });
            setGame(state);
            setTurnDeadline(deadlineIn(msg.turnMs));
            if (!resumingRef.current) toast.success(`Matched with ${msg.opponentName} — game on!`);
            resumingRef.current = false;
          } catch {
            client.requestSync();
          }
          break;
        }
        case 'move_applied': {
          const g = gameRef.current;
          if (!g) break;
          setTurnDeadline(deadlineIn(msg.turnMs));
          if (msg.auto) {
            const mine = g.current === matchRef.current?.side;
            toast(
              mine
                ? "Time's up — a random line was drawn for you."
                : 'Opponent ran out of time — a random line was drawn for them.'
            );
          }
          const r = applyMove(g, msg.edge);
          if (!r || r.next.turn !== msg.turn) {
            client.requestSync(); // desync — ask for the authoritative state
            break;
          }
          setGame(r.next);
          break;
        }
        case 'state':
          try {
            setGame(deserializeState(msg.state));
            setTurnDeadline(deadlineIn(msg.turnMs));
          } catch {
            // ignore malformed sync
          }
          break;
        case 'opponent_away':
          setOpponentAway(Date.now() + msg.graceMs);
          setTurnDeadline(null);
          break;
        case 'opponent_back':
          setOpponentAway(null);
          setTurnDeadline(deadlineIn(msg.turnMs));
          toast.success('Opponent is back — the game continues.');
          break;
        case 'rematch_requested':
          setRematch('received');
          toast(`${msg.byName} wants a rematch`);
          break;
        case 'match_ended': {
          const g = gameRef.current;
          const m = matchRef.current;
          clearMatch();
          if (g && m) {
            // Let the player choose: close, find another player, or play on vs the bot.
            setQueued(false);
            setEnded({ state: g, side: m.side, opponentName: m.opponentName, reason: msg.reason });
            break;
          }
          bot.reset();
          setQueued(true);
          client.enqueue();
          break;
        }
        case 'move_rejected':
          break; // input is locked off-turn; a reject just means a raced click
      }
    });

    return () => {
      offMessage();
      offStatus();
      client.close();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── actions ──────────────────────────────────────────────────────────────

  const leavePage = useCallback(() => {
    const client = clientRef.current;
    if (client) {
      if (gameRef.current) client.leaveMatch();
      else client.dequeue();
    }
    navigate('/');
  }, [navigate]);

  const acceptOffer = useCallback(() => {
    clientRef.current?.answerOffer(true);
    setOfferPending(true);
  }, []);

  const declineOffer = useCallback(() => {
    clientRef.current?.answerOffer(false);
    setOffer(null);
    setOfferPending(false);
  }, []);

  const onlineMove = useCallback(
    (e: Parameters<OnlineClient['move']>[0]) => {
      const g = gameRef.current;
      if (!g || !match || g.over || g.current !== match.side) return;
      clientRef.current?.move(e); // server validates and echoes the accepted move
    },
    [match]
  );

  const requestRematch = useCallback(() => {
    if (rematch === 'sent') return;
    clientRef.current?.rematch();
    setRematch((r) => (r === 'received' ? 'none' : 'sent'));
  }, [rematch]);

  const findNewMatch = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    client.leaveMatch();
    clearMatch();
    bot.reset();
    setQueued(true);
    client.enqueue();
  }, [bot, clearMatch]);

  const findAnotherPlayer = useCallback(() => {
    setEnded(null);
    setRobot(false);
    bot.reset();
    setQueued(true);
    clientRef.current?.enqueue();
  }, [bot]);

  const continueWithRobot = useCallback(() => {
    if (!ended) return;
    bot.resume(ended.state, (1 - ended.side) as PlayerId);
    setEnded(null);
    setRobot(true);
  }, [bot, ended]);

  const leaveQueue = useCallback(() => {
    clientRef.current?.dequeue();
    setQueued(false);
    setOffer(null);
  }, []);

  const joinQueue = useCallback(() => {
    clientRef.current?.enqueue();
    bot.reset();
    setQueued(true);
  }, [bot]);

  // ── derived view state ───────────────────────────────────────────────────

  const players: [Player, Player] = useMemo(() => {
    if (match && me) return seatPlayers(match.side, me.name, match.opponentName);
    if (ended && me) return seatPlayers(ended.side, me.name, ended.opponentName);
    if (robot) return seatPlayers((1 - bot.botSide) as PlayerId, me?.name ?? 'You', 'Bot');
    return [
      { ...RED, name: me?.name ?? 'You', initials: makeInitials(me?.name ?? 'You') },
      { ...BLUE, name: 'Bot', initials: 'BO' },
    ];
  }, [match, me, ended, robot, bot.botSide]);

  const inMatch = match !== null && game !== null;

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <button
            onClick={leavePage}
            className="flex items-center gap-1.5 text-[13px] font-bold text-[#8A91A1] transition-colors hover:text-[#10131A]"
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
            Leave
          </button>
          <h1 className="text-[17px] font-extrabold tracking-[-0.03em] text-[#10131A]">
            Dots &amp; Boxes · Online
          </h1>
          <div className="flex items-center gap-2">
            {me && (
              <span className="hidden border border-[#E4E7EE] px-2.5 py-1 text-[12px] font-bold text-[#10131A] sm:inline-block">
                {me.name}
              </span>
            )}
            <span
              title={connStatus === 'open' ? 'Connected' : 'Connection lost — reconnecting…'}
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                connStatus === 'open' ? 'bg-[#22C55E]' : 'animate-pulse bg-[#FF1E1E]'
              }`}
            />
          </div>
        </header>

        {connStatus !== 'open' && (
          <div className="mb-4 border border-[#FFD6D6] bg-[#FFF5F5] px-4 py-2.5 text-[13px] font-semibold text-[#B91C1C]">
            {connStatus === 'replaced'
              ? 'This online session was opened in another tab — continue playing there.'
              : inMatch
                ? 'Connection lost — reconnecting… your seat is held for 90 seconds.'
                : 'Connection lost — reconnecting…'}
          </div>
        )}

        <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="mx-auto w-full max-w-[640px]">
            {inMatch ? (
              <>
                <Scoreboard
                  state={game}
                  players={players}
                  onNewGame={leavePage}
                  selfSide={match.side}
                  newGameLabel="Leave match"
                  newGameConfirmTitle="Leave this match?"
                  newGameConfirmDescription={`${match.opponentName} will be notified and the match will end.`}
                  newGameConfirmAction="Yes, leave match"
                />
                {opponentAway !== null ? (
                  <OpponentAway opponentName={match.opponentName} deadline={opponentAway} />
                ) : (
                  !game.over &&
                  turnDeadline !== null && (
                    <TurnTimer
                      deadline={turnDeadline}
                      mine={game.current === match.side}
                      color={players[game.current].color}
                    />
                  )
                )}
                <div className="relative mt-6">
                  <Board
                    state={game}
                    players={players}
                    onMove={onlineMove}
                    locked={
                      game.over ||
                      game.current !== match.side ||
                      opponentAway !== null ||
                      connStatus !== 'open'
                    }
                  />
                  <GameOver
                    state={game}
                    players={players}
                    onRematch={requestRematch}
                    onNewPlayers={findNewMatch}
                    rematchLabel={
                      rematch === 'sent'
                        ? 'Waiting for opponent…'
                        : rematch === 'received'
                          ? 'Accept rematch'
                          : 'Rematch'
                    }
                    rematchDisabled={rematch === 'sent'}
                    secondaryLabel="Find new match"
                  />
                </div>
              </>
            ) : ended ? (
              <>
                <Scoreboard
                  state={ended.state}
                  players={players}
                  onNewGame={leavePage}
                  selfSide={ended.side}
                  newGameLabel="Leave"
                  newGameConfirmTitle="Leave online play?"
                  newGameConfirmDescription="You'll return to the start screen."
                  newGameConfirmAction="Yes, leave"
                />
                <div className="relative mt-6">
                  <Board state={ended.state} players={players} onMove={() => {}} locked />
                </div>
              </>
            ) : robot ? (
              <>
                <Scoreboard
                  state={bot.state}
                  players={players}
                  onNewGame={findAnotherPlayer}
                  botDifficulty={difficulty}
                  onChangeDifficulty={setDifficulty}
                  botSide={bot.botSide}
                  selfSide={(1 - bot.botSide) as PlayerId}
                  newGameLabel="Find a player"
                  newGameConfirmTitle="Find a real player?"
                  newGameConfirmDescription="This bot game ends and you join the queue (you can play a fresh bot game while you wait)."
                  newGameConfirmAction="Yes, find a player"
                />
                <div className="relative mt-6">
                  <Board state={bot.state} players={players} onMove={bot.move} locked={bot.botTurn} />
                  <GameOver
                    state={bot.state}
                    players={players}
                    onRematch={bot.reset}
                    onNewPlayers={findAnotherPlayer}
                    rematchLabel="Play the bot again"
                    secondaryLabel="Find a real player"
                  />
                </div>
              </>
            ) : queued ? (
              <>
                <div className="mb-4 flex items-center gap-2.5 border border-[#F5E3C0] bg-[#FFF9F0] px-4 py-2.5 text-[13px] font-semibold text-[#8A6100]">
                  <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#F5A623]" />
                  You're playing the bot while you wait — we'll notify you the moment a real
                  player is matched with you.
                </div>
                <Scoreboard
                  state={bot.state}
                  players={players}
                  onNewGame={leaveQueue}
                  botDifficulty={difficulty}
                  onChangeDifficulty={setDifficulty}
                  selfSide={0}
                  newGameLabel="Leave queue"
                  newGameConfirmTitle="Leave the queue?"
                  newGameConfirmDescription="You'll stop waiting for an opponent and can rejoin the line anytime."
                  newGameConfirmAction="Yes, leave queue"
                />
                <div className="relative mt-6">
                  <Board state={bot.state} players={players} onMove={bot.move} locked={bot.botTurn} />
                  <GameOver
                    state={bot.state}
                    players={players}
                    onRematch={bot.reset}
                    onNewPlayers={leaveQueue}
                    rematchLabel="Play again"
                    secondaryLabel="Leave queue"
                  />
                </div>
              </>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-[#E4E7EE] px-6 py-16 text-center">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF1E1E]" />
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#004EFF]" />
                </div>
                <h2 className="mt-4 text-[24px] font-extrabold tracking-[-0.03em] text-[#10131A]">
                  {connStatus === 'open' ? 'Ready when you are' : 'Finding the lobby…'}
                </h2>
                <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[#8A91A1]">
                  Join the queue and play the bot while you wait. First in line gets matched first.
                </p>
                <button
                  onClick={joinQueue}
                  disabled={connStatus !== 'open'}
                  className="mt-8 bg-[#10131A] px-8 py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Find a match
                </button>
              </div>
            )}

            <footer className="pt-4 text-center text-[11px] text-[#B8BECC]">
              Click between two adjacent dots to draw a line · close a square to claim it and go
              again
            </footer>
          </div>

          <LobbyPanel
            players={lobby}
            selfName={me?.name ?? null}
            queuePosition={queued ? queueInfo.position : null}
            queueSize={queueInfo.size}
          />
        </div>
      </div>

      {ended && (
        <OpponentGone
          opponentName={ended.opponentName}
          reason={ended.reason}
          gameOver={ended.state.over}
          onClose={leavePage}
          onFindPlayer={findAnotherPlayer}
          onPlayBot={continueWithRobot}
        />
      )}

      {offer && (
        <MatchOffer
          opponentName={offer.opponentName}
          expiresInMs={offer.expiresInMs}
          pending={offerPending}
          onAccept={acceptOffer}
          onDecline={declineOffer}
        />
      )}
    </main>
  );
}
