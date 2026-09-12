import { useState } from 'react'
import { Atoms } from './Atoms'
import { Finish } from './Finish'
import { RenderPreview } from './RenderPreview'
import { GameTable } from './GameTable'
import { Reveal } from './Reveal'
import { ENDINGS, REVEALS, SCENARIOS, claimFor, standingsFor } from './fixtures'
import type { RevealData } from './reveal'
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
  const [tab, setTab] = useState<'table' | 'reveal' | 'end' | 'atoms' | 'render'>('table')
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

  function play(index: number) {
    setRevealIndex(index)
    setPlaying(null)
    setRun((n) => n + 1)
    window.setTimeout(() => setPlaying(REVEALS[index].data), 900)
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

      {tab === 'render' ? (
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
          <Finish winnerName={ENDINGS[ending].winnerName} view={ENDINGS[ending].view} />
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
          <GameTable
            view={scenario.view}
            onBid={(bid) =>
              setActed(`Bid ${bid.quantity} × ${bid.face === 1 ? 'Perudo' : bid.face}`)
            }
            onLie={() => setActed('Lie')}
            onBull={() => setActed('Bull')}
          />
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
          <Reveal
            key={run}
            standings={standingsFor(REVEALS[revealIndex].data)}
            claim={claimFor(REVEALS[revealIndex].data)}
            data={playing}
            onDone={() => play(revealIndex)}
          />
        </>
      )}
    </div>
  )
}
