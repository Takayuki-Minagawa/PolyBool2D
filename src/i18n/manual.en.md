# PolyBool2D — User Manual

PolyBool2D is a browser-based 2D CAD app for drawing and editing polygons with holes,
checking areas, running geometry operations, and exchanging lightweight CAD data.

---

## 1. Layout

- **Header**: new project, local project manager, JSON / SVG import, exports, share URL,
  Undo / Redo, language and theme, shortcuts, manual
- **Toolbar**: selection, drawing, measurement, vertex editing, knife, boolean and clipboard tools
- **Canvas**: drawing, selection, movement and vertex editing; use the wheel to zoom
- **Property panel**: dimensions, area, transforms, vertices and holes, layers, outliner,
  geometry operations and project settings
- **Status bar**: active tool, selected area, tool guidance and errors

---

## 2. Shortcuts

### Tools

| Key | Tool |
| --- | --- |
| `V` | Select |
| `H` | Pan |
| `P` | Polygon |
| `R` | Rectangle |
| `C` | Circle |
| `O` | Ellipse |
| `A` | Arc |
| `L` | Polyline |
| `U` | Hole |
| `D` | Guide line |
| `M` | Measure |
| `E` | Vertex edit |
| `K` | Knife |

### Common commands

| Input | Action |
| --- | --- |
| `Enter` | Finish a point sequence; while typing a length, apply that value |
| `Esc` | Cancel the current drawing and numeric input |
| `Backspace` | Remove a typed digit or the previous drawing point; otherwise delete selection |
| `Delete` | Delete selection |
| `Ctrl/⌘ + A` | Select all |
| `Ctrl/⌘ + C` / `X` / `V` | Copy / cut / paste |
| `Ctrl/⌘ + D` | Duplicate selected polygons |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` / `Ctrl/⌘ + Y` | Redo |
| Arrow keys | Move selection by one grid cell |
| `Shift` + Arrow keys | Move selection by one tenth of a grid cell |
| `F` | Fit the selection, or all content when nothing is selected |
| `G` / `S` | Toggle grid / coordinate snapping |
| `?` | Open or close the shortcut list |
| Mouse wheel | Zoom |
| Middle-button drag / `Space` + drag | Temporarily pan |
| Right-click | Open the context menu |

---

## 3. Snapping, ortho and numeric input

### Coordinate snapping

When snapping is enabled, the cursor snaps to the grid, visible vertices, edges, midpoints,
polylines, arcs and guides. A guide snaps along its infinite extension, not only the displayed
segment. Grid, vertex, edge/midpoint and pixel tolerance settings are editable in Project settings.

### Angular snap and `Shift`

After the first point, the direction is quantized from the previous point in 15° increments by
default. Project settings can enable/disable angular snapping and change the increment. Hold
`Shift` to prioritize a 90° horizontal/vertical constraint. For rectangles, `Shift` also
constrains the result to a square.

### Entering an exact length

While drawing a polygon, hole, polyline or measurement, indicate a direction with the cursor,
type a positive number, and press `Enter`. The next point is placed at that exact distance from
the previous point. Both `.` and `,` work as decimal separators. Circle, guide and knife previews
can also apply a typed length.

The value appears in a numeric HUD over the canvas. `Backspace` removes a digit and `Esc` cancels it.

### Dimension HUD

Drawing previews show:

- segment lengths for polygons, holes and polylines
- W×H for rectangles
- radius for circles and arcs
- X / Y radii for ellipses
- length for guides and knife strokes
- segment lengths, total length and the latest three-point angle for measurements

---

## 4. Drawing tools

### Polygon

1. Press `P` and click the vertices in order.
2. Press `Enter`, or click near the first point after adding at least three points.
3. Use `Backspace` to remove the previous point or `Esc` to cancel the drawing.

Self-intersecting and zero-area rings are rejected.

### Rectangle, circle and ellipse

- **Rectangle (`R`)**: drag a diagonal. Hold `Shift` for a square.
- **Circle (`C`)**: drag from the center to set the radius.
- **Ellipse (`O`)**: drag from the center to set the X and Y radii.

Circles and ellipses are stored as polygons using the project's Circle segments setting.

### Arc, polyline and guide

- **Arc (`A`)**: click the center, start and end points. The shorter arc is stored as an approximated polyline.
- **Polyline (`L`)**: click points in order and press `Enter` after at least two points.
- **Guide (`D`)**: drag between two points. It is displayed and snapped as an infinite line.

These are non-area linear entities. Use the outliner to edit their names, visibility, lock and layer.

### Hole

1. Select exactly one target polygon.
2. Press `U` and click at least three points inside it.
3. Press `Enter` or click near the first point to finish.

A hole is rejected if it lies outside the outer ring, intersects it, self-intersects or overlaps
another hole. Hole area is subtracted from the polygon's net area.

### Measure

Press `M` and click points in sequence. The preview shows segment lengths, total length and, after
three points, the latest angle. `Backspace` removes the previous point. `Enter` or `Esc` finishes.
Measurements are temporary and are not saved to the project.

---

## 5. Selection and editing

- Click for a single selection; `Shift`-click to add or remove an item.
- Drag a selected polygon body to move the selected polygons together.
- Arrow-key movement works for both polygons and linear entities.
- Hidden or locked entities cannot be selected or edited.
- Copy / cut / paste supports polygons and linear entities. Each paste is offset progressively.
- Right-click for copy, cut, paste, duplicate, Union, Difference, delete and move-to-layer commands.

### Vertex editing

Selecting a polygon shows handles for both its outer ring and holes.

- drag a handle to move it
- `Alt`-click a handle to delete it
- type X / Y coordinates in the property panel
- use `+` to insert a vertex at the next edge's midpoint
- use `×` to delete a vertex
- use the button beside a hole heading to remove the entire hole

Every ring must retain at least three vertices. If editing creates a self-intersection or another
invalid condition, the polygon receives a red outline and the status bar reports the validation error.

### Transforms, arrangement and readouts

The property panel provides 90° and arbitrary-angle rotation, horizontal/vertical mirroring,
0.5× / 2× and independent X / Y scaling. Multiple polygons can be edge- or center-aligned;
three or more can be distributed evenly. It also shows net, outer and hole area, perimeter,
axis-aligned W×H and centroid.

---

## 6. Layers and outliner

### Layers

- Use `+` to add a layer and `●` to make it the drawing layer.
- Edit each layer's name, color, visibility and lock state.
- Assign the current selection to a layer with the assignment dropdown.
- The final remaining layer cannot be deleted.
- Deleting a layer moves its entities to another remaining layer.

### Entity outliner

The outliner lists areas, guides, lines and arcs. Click a row to select it, and directly edit its
name, visibility, lock and layer. Layer visibility and locking also apply to all entities on that layer.

---

## 7. Boolean and advanced geometry

### Boolean operations

- **Union** merges two or more selected polygons.
- **Difference** subtracts all later selections from the first selected polygon.
- **Intersection** keeps only common regions.
- **XOR** keeps only non-overlapping regions.

### Knife

1. Select the target polygon and press `K`.
2. Drag a straight stroke that meets its boundary at least twice.

The half-plane clipping implementation supports polygons with holes and multiple intersections.
It can produce several pieces and verifies total area before accepting the result. A stroke that
overlaps a boundary is rejected.

### Advanced geometry

Select polygons and use the Advanced geometry controls in the property panel.

- **Offset** creates round-join output outward for a positive distance or inward for a negative distance.
- **Repair** normalizes self-intersections/self-touching paths and replaces the selection with the result.
- **Chamfer** replaces every corner with a straight cut at the requested distance.
- **Fillet** replaces every corner with an approximated tangent arc of the requested radius.
- **Minimum bounds** adds the minimum-area rotated rectangle around all selected vertices.
- **Convex hull** replaces the selection with its convex hull.
- **Simplify** removes redundant points with the Douglas-Peucker algorithm.

An inward offset or repair can split into several polygons or return no material.

---

## 8. Projects and backups

Changes auto-save to browser `localStorage` after about 400 ms. Open **Projects** in the header to
open, rename, duplicate or delete multiple locally saved projects.

Whenever saved content changes, the previous valid save is retained. Each project keeps up to
10 generations. Open **Backups** for a project to inspect timestamps and entity counts, then press
**Restore**. The state that existed immediately before restoration also becomes a backup.

These backups live only in the same browser. They do not protect against cleared browser data,
device failure or storage quota problems, so export important work as JSON too.

---

## 9. Import, export and sharing

| Command | Result |
| --- | --- |
| **Import JSON / JSON** | Import / export a complete project including settings, layers, areas and linear entities |
| **Import SVG** | Polygonize `polygon`, `rect`, `circle`, `ellipse` and `path` elements |
| **SVG** | Export visible polygons as paths with holes |
| **PNG** | Rasterize the SVG export on a transparent background, up to 4096 px on the long side |
| **DXF** | Export visible outer and hole rings as closed `LWPOLYLINE` entities |
| **Area CSV** | Export polygon name, area, perimeter, vertex and hole counts |
| **Vertex CSV** | Export every outer and hole vertex coordinate |

For SVG paths, absolute and relative `M/L/H/V/Z` commands are supported directly. Curves are
sampled when the browser provides path-length measurement APIs. Styles, text, images and other
SVG features are not reproduced completely.

**Share URL** compresses the project into the URL hash and copies it to the clipboard. Opening the
URL loads the shared data before any local project. A hash longer than 8,000 characters is rejected.
Anyone who receives the URL can reconstruct the drawing.

---

## 10. Project settings

The property panel can edit:

- coordinate unit: mm / cm / m
- area display unit: mm² / cm² / m²
- grid spacing
- circle / ellipse / arc approximation segments
- grid, vertex and edge/midpoint snapping plus pixel tolerance
- angular snap enable/disable and increment (1° to 180°)
- area and coordinate decimal precision

Changing the coordinate unit does not rescale existing coordinate numbers; it changes how they are
interpreted and displayed.

---

## 11. Limitations and cautions

- Circles, ellipses, arcs, fillets and round offsets are line-segment approximations.
- SVG import supports a subset of elements and path commands.
- SVG / PNG / DXF exports omit the grid, HUD, measurement preview and linear entities.
- DXF holes are independent closed polylines; no DWG, region or hatch data is generated.
- Local saves depend on browser storage and there is no real-time collaborative editing.
- 3D, BIM and DWG import/export are not supported.
