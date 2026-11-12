/** The three concentric hexagons of the plane (outer, middle, dashed inner); decorative, shared by the plane and its empty state. */
export function HexOutline() {
  return (
    <>
      <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.25" />
      <polygon points="50,12 82.9,31 82.9,69 50,88 17.1,69 17.1,31" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.3" />
      <polygon
        points="50,26 70.8,38 70.8,62 50,74 29.2,62 29.2,38"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="0.3"
        strokeDasharray="1.2 1.2"
      />
    </>
  );
}
