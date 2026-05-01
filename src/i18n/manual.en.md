# PolyBool2D — User Manual

PolyBool2D is a **2D polygon CAD web app** for building/architectural area calculations.
Draw, edit, perform boolean operations, and split polygons with a knife to compute areas.

---

## 1. Layout

- **Header**: project operations (new / import / export), language & theme toggles, manual
- **Toolbar**: drawing / editing tools
- **Canvas**: SVG drawing area. Mouse wheel zooms; Space + drag (or pan tool) pans
- **Property panel**: selected entity info, vertex table, area, settings
- **Status bar**: cursor coords, tool hint

---

## 2. Shortcuts

| Key | Action |
| --- | --- |
| `V` | Select tool |
| `H` | Pan tool |
| `P` | Polygon |
| `R` | Rectangle |
| `C` | Circle |
| `K` | Knife |
| `Enter` | Confirm |
| `Esc` | Cancel |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl/⌘ + A` | Select all |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` / `Ctrl/⌘ + Y` | Redo |
| `F` | Fit selection or all content |
| `G` | Toggle grid |
| `S` | Toggle snap |

---

## 3. Drawing

### Polygon
1. Pick **Polygon** from the toolbar.
2. Click to add vertices.
3. Press `Enter` (3+ points needed) or `Esc` to cancel.

### Rectangle
1. Pick **Rectangle**.
2. Drag a diagonal. `Shift` constrains to a square.

### Circle
1. Pick **Circle**.
2. Drag from the center to set the radius.
3. Stored internally as a polygon (default 64 segments).

---

## 4. Vertex editing

Select a polygon to reveal vertex handles:

- Drag handles to move vertices
- Type outer-ring X/Y values in the property panel's coordinate table
- Vertex insertion and per-vertex deletion are not implemented yet

---

## 5. Boolean operations

### Union
Select 2+ polygons → click **Union**. Overlaps are merged.

### Difference
1. Select the subject first.
2. `Shift`-click cutters to add them.
3. Click **Difference**.

Example: select a rectangle, `Shift`-click a circle → **Difference** carves a circular hole.

---

## 6. Knife split

1. Select the polygon to split.
2. Pick **Knife** in the toolbar.
3. Drag a straight line that crosses the outer boundary at exactly 2 points.
4. Release the drag to run the split. Total area before/after is preserved.

> The current MVP supports **simple polygons × single line × 2 intersections** only.

---

## 7. Area

- The **net area** = outer area − sum of hole areas
- The default coordinate unit is mm; area is displayed in m²
- The property panel shows totals for selection and project

---

## 8. Save & export

- Auto-saves to `localStorage`
- Header **Export** → downloads project JSON
- **Import** → loads a JSON project

---

## 9. Known limitations

- Knife: single line, exactly 2 intersections
- Self-intersecting polygons not supported
- Vertex insertion and per-vertex deletion are not implemented yet
- Circles are polygon approximations
- 3D / BIM integrations out of scope
