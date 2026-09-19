import { useEffect, useRef, useState } from 'react'
import { Atoms } from './Atoms'
import { Finish } from './Finish'
import { RenderPreview } from './RenderPreview'
import { GameTable } from './GameTable'
import { LobbyView } from '../rooms/LobbyView'
import { ENDINGS, LOBBIES, REVEALS, SCENARIOS, claimFor, tableFor } from './fixtures'
import type { RevealData } from './reveal'
import '../game/GameScreen.css'
import './PreviewScreen.css'

/**
 * Every game screen, without a game.
 *
 * The action layer that would produce these states does not exist yet, and the
 * UI still has to be looked at on a real phone in a real hand before it is
 * built around. So the states are held as fixtures and rendered for real: this
 * is the actual `GameTable` and the actual `Reveal`, not a mockup of them.
 *
 * It reaches no network and no database. Nothing here can start, join or
 * affect a game, which is why it is safe to leave reachable — and worth
 * leaving reachable, because every future change to these screens can be
 * checked against it in one place.
 */
export function PreviewScreen() {
  const [tab, setTab] = useState<'table' | 'reveal' | 'end' | 'lobby' | 'atoms' | 'render'>(
    'table',
  )
  const [lobby, setLobby] = useState(0)
  const [ending, setEnding] = useState(0)
  const [scenario, setScenario] = useState(SCENARIOS[0])
  const [revealIndex, setRevealIndex] = useState(0)
  // Null replays the held beat, so the pause can be seen and not just reasoned
  // about — it is the part of the reveal most easily got wrong.
  const [playing, setPlaying] = useState<RevealData | null>(REVEALS[0].data)
  const [run, setRun] = useState(0)
  // Shown rather than alerted: an alert is a modal interruption on a phone, and
  // this screen exists precisely to be poked at quickly.
  const [acted, setActed] = useState<string | null>(null)

  // Held so a replay started and then abandoned — another scenario picked, the
  // tab closed — does not land its answer on a screen that has moved on.
  const held = useRef(0)
  useEffect(() => () => window.clearTimeout(held.current), [])

  function play(index: number) {
    setRevealIndex(index)
    setPlaying(null)
    setRun((n) => n + 1)
    window.clearTimeout(held.current)
    held.current = window.setTimeout(() => setPlaying(REVEALS[index].data), 900)
  }

  return (
    <div className="preview">
      <header className="preview__head">
        <h1 className="preview__title">Screens</h1>
        <p className="preview__blurb">
          The real components, driven by fixtures. Nothing here touches a game.
        </p>
        <div className="preview__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'table'}
            onClick={() => {
              setTab('table')
              setActed(null)
            }}
          >
            Table
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'reveal'}
            onClick={() => setTab('reveal')}
          >
            Reveal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'end'}
            onClick={() => setTab('end')}
          >
            Game over
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'lobby'}
            onClick={() => setTab('lobby')}
          >
            Lobby
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'atoms'}
            onClick={() => setTab('atoms')}
          >
            Objects
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'render'}
            onClick={() => setTab('render')}
          >
            Render
          </button>
        </div>
      </header>

      {tab === 'lobby' ? (
        <>
          <nav className="preview__picks">
            {LOBBIES.map((option, index) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={index === lobby}
                onClick={() => setLobby(index)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <p className="preview__note">{LOBBIES[lobby].note}</p>
          {/* The whole lobby, not just its table: the invite rail and the
              controls are the parts that decide whether a six-seat room still
              fits on a phone, and they cannot be judged apart from it. */}
          <LobbyView
            code="4821"
            status="lobby"
            seats={LOBBIES[lobby].seats}
            connection="live"
            youAreHost={LOBBIES[lobby].seats.some((s) => s.is_host && s.is_you)}
            busy={false}
            error={null}
            onStart={() => setActed('Start game')}
            onPlayAgain={() => setActed('Play again')}
            onManage={(seat) => setActed(`Manage ${seat.display_name}`)}
            onEnd={() => setActed('End room')}
            onLeave={() => setActed('Leave room')}
          />
        </>
      ) : tab === 'render' ? (
        <RenderPreview />
      ) : tab === 'atoms' ? (
        <Atoms />
      ) : tab === 'end' ? (
        <>
          <nav className="preview__picks">
            {ENDINGS.map((option, index) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={index === ending}
                onClick={() => setEnding(index)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          {/* On the table, because that is where a game ends. Previewing the
              card on its own would be previewing a screen that no longer
              exists. */}
          <GameTable
            view={ENDINGS[ending].view}
            finish={
              <Finish
                winnerName={ENDINGS[ending].winnerName}
                winnerId={ENDINGS[ending].winnerId}
                view={ENDINGS[ending].view}
              />
            }
            onBid={() => setActed('Bid')}
            onLie={() => setActed('Lie')}
            onBull={() => setActed('Bull')}
          />
        </>
      ) : tab === 'table' ? (
        <>
          <nav className="preview__picks">
            {SCENARIOS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === scenario.id}
                onClick={() => setScenario(option)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <p className="preview__note">{scenario.note}</p>
          {acted !== null && (
            <p className="preview__acted" role="status">
              {acted}
            </p>
          )}
          {/*
            * In a frame the size of a real game screen.
            *
            * The table is the one screen in the product that has to fit the
            * window — every control on it is pressed under time pressure, and a
            * control below the fold is a control that is not there. That only
            * works because the board is handed a definite height and shrinks the
            * stage to it, so a preview that let it size to its content would be
            * showing a layout the player never gets, and would quietly hide the
            * one fault this screen exists to catch. The frame stands in for the
            * app shell's own gutter, which is what the real screen subtracts.
            */}
          <div className="preview__fit">
            {/*
              * Wrapped the way the real screen wraps it.
              *
              * In a game, `GameScreen` is not a child of the app shell: the
              * room renders it *inside* `LobbyView`, which keeps its own
              * controls below. Previewing the table bare meant previewing a
              * different document from the one that ships — and the height
              * rules that keep the controls above the fold are written against
              * ancestors, so they held here and broke there. The player saw Lie
              * and Bull under Safari's address bar on the one screen no test
              * was looking at.
              *
              * The refusal line is part of it. It is a row that appears without
              * warning, in the middle of a game, on the screen with the least
              * room to spare.
              */}
            <LobbyView
              code="4821"
              status="in_game"
              seats={LOBBIES[LOBBIES.length - 1].seats}
              connection="live"
              youAreHost
              busy={false}
              error={null}
              onStart={() => setActed('Start game')}
              onPlayAgain={() => setActed('Play again')}
              onManage={() => setActed('Manage')}
              onEnd={() => setActed('End room')}
              onLeave={() => setActed('Leave room')}
            >
              <div className="game">
                {/* On half the scenarios, so the notice is looked at in place:
                    over the scene, sized to its sentence, costing the table no
                    height at all. */}
                {scenario.id.charCodeAt(0) % 2 === 0 && (
                  <button type="button" className="game__note game__note--refused">
                    Something broke at our end. Try again.
                    <b className="game__code">INTERNAL</b>
                  </button>
                )}
                <GameTable
                  view={scenario.view}
                  onBid={(bid) =>
                    setActed(`Bid ${bid.quantity} × ${bid.face === 1 ? 'Perudo' : bid.face}`)
                  }
                  onLie={() => setActed('Lie')}
                  onBull={() => setActed('Bull')}
                />
              </div>
            </LobbyView>
          </div>
        </>
      ) : (
        <>
          <nav className="preview__picks">
            {REVEALS.map((option, index) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={index === revealIndex}
                onClick={() => play(index)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          {/* The real table, with the real reveal running on it. */}
          <GameTable
            key={run}
            view={tableFor(REVEALS[revealIndex].data)}
            reveal={{
              claim: claimFor(REVEALS[revealIndex].data),
              data: playing,
              onDone: () => play(revealIndex),
            }}
            onBid={() => {}}
            onLie={() => {}}
            onBull={() => {}}
          />
        </>
      )}
    </div>
  )
}
