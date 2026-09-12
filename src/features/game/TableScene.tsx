import { useEffect, useRef } from 'react'
import type { SceneSeat, TableScene as Scene } from '../../three/scene'
import { createTableScene } from '../../three/scene'
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
  onReady,
}: {
  seats: readonly SceneSeat[]
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

  return <canvas ref={canvasRef} className="scene" aria-hidden="true" />
}
