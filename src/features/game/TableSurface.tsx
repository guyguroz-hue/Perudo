import { VIEW, edgePath, ringPath } from './camera'
import './TableSurface.css'

/**
 * Where the cups stand, as a fraction of the table's radius.
 *
 * Close to the rim, which is where people put their cups — and which is the
 * only place the near one can go without standing on top of the bid.
 */
export const SEAT_RADIUS = 0.95
/** The brass ring inlaid in the middle, which frames the bid. */
export const INLAY_RADIUS = 0.36
/** How thick the tabletop is, in view units. */
const THICKNESS = 0.055

/**
 * The table.
 *
 * Drawn from the camera rather than fitted by eye: the rim is a circle put
 * through the projection, and the band below its near arc is the edge of the
 * timber — the thing you can only see because you are sitting level with the
 * table instead of hovering over it. That band is what turns an ellipse into
 * furniture.
 *
 * Stylised, not photoreal. One light source from above and behind, one clear
 * silhouette, grain you can feel rather than count. A photograph of cherry at
 * this size is noise.
 */
export function TableSurface() {
  return (
    <svg
      className="felt"
      viewBox={`${VIEW.minX} ${VIEW.minY} ${VIEW.width} ${VIEW.height}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="tabletop" cx="50%" cy="24%" r="76%">
          <stop offset="0%" stopColor="var(--wood-light)" />
          <stop offset="44%" stopColor="var(--wood)" />
          <stop offset="82%" stopColor="var(--wood-deep)" />
          <stop offset="100%" stopColor="var(--wood-edge)" />
        </radialGradient>
        {/* The lamp, pooling on the far half where it is furthest from the eye
            and so does the most to describe the surface. */}
        <radialGradient id="sheen" cx="50%" cy="14%" r="46%">
          <stop offset="0%" stopColor="#ffe2be" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffe2be" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--wood-deep)" />
          <stop offset="30%" stopColor="var(--wood-edge)" />
          <stop offset="100%" stopColor="var(--wood-rim)" />
        </linearGradient>
      </defs>

      {/* The shadow the table drops on the floor of the room. */}
      <ellipse
        cx="0"
        cy={VIEW.minY + VIEW.height * 0.72}
        rx={VIEW.width * 0.46}
        ry={VIEW.height * 0.16}
        className="felt__cast"
      />

      <path d={edgePath(1, THICKNESS)} fill="url(#edge)" />
      <path d={ringPath(1)} fill="url(#tabletop)" />
      <path d={ringPath(1)} fill="url(#sheen)" />
      {/* A thin lip of brass where the top meets the edge. */}
      <path d={ringPath(1)} className="felt__lip" />
      <path d={ringPath(INLAY_RADIUS)} className="felt__inlay" />
    </svg>
  )
}
