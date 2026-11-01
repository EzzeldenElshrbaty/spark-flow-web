/** Which side of the box a list opens on: above when it fits there, else the side with more room. */
export function popupPlacement(space: { above: number; below: number }, listHeight: number): 'above' | 'below' {
  if (space.above >= listHeight) return 'above'
  return space.above >= space.below ? 'above' : 'below'
}
