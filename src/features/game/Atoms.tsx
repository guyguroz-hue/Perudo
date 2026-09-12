import { Cup } from '../../components/Cup'
import { Die } from '../../components/Die'
import { FACES } from '../../game'
import { SEAT_TONES } from './colors'
import './Atoms.css'

/**
 * The objects everything else is built from, at the sizes they are actually
 * used.
 *
 * A die looks fine at 64px and falls apart at 22; a cup reads at 90 and
 * becomes a smear at 40. Neither of those is visible in a component library
 * that shows one specimen at a comfortable size, so this shows the range.
 */
export function Atoms() {
  return (
    <div className="atoms">
      <section>
        <h3>Faces</h3>
        <div className="atoms__row">
          {FACES.map((face) => (
            <Die key={face} face={face} size={52} />
          ))}
        </div>
      </section>

      <section>
        <h3>The Joker, down to a hand</h3>
        <p className="atoms__note">
          Never a numeral, anywhere. 22px is a die in somebody&rsquo;s hand.
        </p>
        <div className="atoms__row atoms__row--baseline">
          {[64, 44, 32, 22].map((size) => (
            <Die key={size} face={1} size={size} />
          ))}
        </div>
      </section>

      <section>
        <h3>Dice counts</h3>
        <p className="atoms__note">
          Somebody else&rsquo;s dice, in their colour. The values were never sent.
        </p>
        <div className="atoms__row">
          {SEAT_TONES.map((tone) => (
            <span key={tone} className="atoms__hand">
              {[0, 1, 2, 3].map((i) => (
                <Die key={i} hidden tone={tone} size={16} />
              ))}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3>Cups</h3>
        <div className="atoms__row atoms__row--wrap">
          {SEAT_TONES.map((tone, i) => (
            <Cup key={tone} tone={tone} size={86} active={i === 2} />
          ))}
        </div>
      </section>

      <section>
        <h3>Cup states</h3>
        <div className="atoms__row atoms__row--wrap">
          <span className="atoms__state">
            <Cup tone="var(--p4)" size={86} />
            <em>covered</em>
          </span>
          <span className="atoms__state">
            <Cup tone="var(--p4)" size={86} state="shaking" />
            <em>shaking</em>
          </span>
          <span className="atoms__state atoms__state--tall">
            <Cup tone="var(--p4)" size={86} state="lifted" />
            <em>lifted</em>
          </span>
        </div>
      </section>
    </div>
  )
}
