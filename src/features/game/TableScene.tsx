import { useEffect, useRef } from 'react'
import type { SceneSeat, TableScene as Scene } from '../../three/scene'
import { createTableScene } from '../../three/scene'
import { PAY_MS } from './revealStage'
import './TableScene.css'

/**
 * The table, rendered.
 *
 * A canvas under the screen's own controls, not a framework around the scene.
 * React owns the tags, the bid and the console — all ordinary DOM, all crisp —
 * and hands this component the list of who is sitting where. The scene renders
 * when that changes and not otherwise: a table of cups standing still has no
 * reason to cost a frame.
 */
export function TableScene({
  seats,
  overhead = 0,
  immediate = false,
  paying = null,
  onRise,
  onReady,
}: {
  seats: readonly SceneSeat[]
  /** Where to look from: 0 is a player's seat, 1 is straight down. */
  overhead?: number
  /** Arrive without travelling — for a viewer who has asked for less motion. */
  immediate?: boolean
  /**
   * Dice changing hands, once a challenge has resolved. Null until then.
   *
   * Played once per distinct object: the effect keys on identity, so the caller
   * has to hand over the same array until the next resolution or the dice fly
   * off the table again on the next render.
   */
  paying?: readonly { index: number; delta: number }[] | null
  /**
   * Called on every frame the eye is moving, with how far up it has got.
   *
   * The overlay is placed by projecting through the same camera, so while it
   * travels the overlay has to be told — once per frame, not once per state
   * change. It is a callback rather than shared state because React must not
   * be in this loop: re-rendering the seat list per frame hands the renderer a
   * new table sixty times a second, and it rebuilds every cup each time.
   */
  onRise?: (overhead: number) => void
  /** Handed the scene so the screen can project seats to DOM positions. */
  onReady?: (scene: Scene) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<Scene | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return

    // A device with no working WebGL is not a crash. The table simply does not
    // render, the room behind it stays, and every control on top of it — which
    // is all ordinary DOM — still works. A game that will not open is worse
    // than a game that opens flat.
    let scene: Scene
    try {
      scene = createTableScene(canvas)
    } catch (error) {
      console.warn('The table could not be rendered on this device.', error)
      return
    }
    sceneRef.current = scene

    const resize = () => {
      const box = canvas.parentElement
      if (box === null) return
      scene.resize(box.clientWidth, box.clientHeight)
      scene.render()
    }

    const observer = new ResizeObserver(resize)
    if (canvas.parentElement !== null) observer.observe(canvas.parentElement)
    resize()
    onReady?.(scene)

    return () => {
      observer.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
  }, [onReady])

  useEffect(() => {
    const scene = sceneRef.current
    if (scene === null) return
    scene.setSeats(seats)
    scene.render()
  }, [seats])

  useEffect(() => {
    const scene = sceneRef.current
    if (scene === null) return
    scene.setOverhead(overhead, immediate)

    if (onRise === undefined) return
    // Follow the eye rather than the request: the move is eased and can be
    // redirected part-way, so the only honest source is where it actually is.
    let frame = 0
    let settled = false
    const watch = () => {
      onRise(scene.overhead)
      settled = Math.abs(scene.overhead - overhead) < 0.001
      frame = settled ? 0 : requestAnimationFrame(watch)
    }
    watch()
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [overhead, immediate, onRise])

  useEffect(() => {
    if (paying === null) return
    sceneRef.current?.pay(paying, PAY_MS / 1000)
  }, [paying])

  return <canvas ref={canvasRef} className="scene" aria-hidden="true" />
}
