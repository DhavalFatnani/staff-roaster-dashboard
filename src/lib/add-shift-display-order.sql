-- Add display_order column to shift_definitions for reordering
-- This allows shifts to be displayed in a custom order

ALTER TABLE shift_definitions 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Set initial display_order based on creation time (oldest first)
UPDATE shift_definitions 
SET display_order = subquery.row_number
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at ASC) as row_number
  FROM shift_definitions
) AS subquery
WHERE shift_definitions.id = subquery.id;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_shift_definitions_display_order 
ON shift_definitions(store_id, display_order);

