-- Backfill untouched legacy boards only. A saved layout version or any
-- non-default item geometry indicates user state and is intentionally kept.
WITH untouched_canvases AS (
  SELECT canvas."id"
  FROM "ProjectCanvas" canvas
  WHERE canvas."layoutVersion" = 0
    AND (SELECT count(*) FROM "CanvasItem" counted WHERE counted."canvasId" = canvas."id") <= 15388
    AND NOT EXISTS (
      SELECT 1
      FROM "CanvasItem" customized
      WHERE customized."canvasId" = canvas."id"
        AND (customized."x" <> 0 OR customized."y" <> 0 OR customized."width" <> 320
          OR customized."height" <> 240 OR customized."zIndex" <> 0 OR customized."sortOrder" <> 0)
    )
), ordered_items AS (
  SELECT item."id", item."canvasId",
    row_number() OVER (PARTITION BY item."canvasId" ORDER BY item."sortOrder", item."createdAt", item."id") - 1 AS item_index
  FROM "CanvasItem" item
  JOIN untouched_canvases canvas ON canvas."id" = item."canvasId"
), coordinates AS (
  SELECT "id", item_index,
    (item_index % 4) * 340 AS x,
    (item_index / 4) * 260 AS y
  FROM ordered_items
)
UPDATE "CanvasItem" item
SET "x" = coordinates.x,
    "y" = coordinates.y,
    "zIndex" = LEAST(coordinates.item_index, 100000)::integer,
    "sortOrder" = coordinates.item_index::integer
FROM coordinates
WHERE item."id" = coordinates."id";
