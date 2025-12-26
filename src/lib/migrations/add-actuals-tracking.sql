-- Migration: Add actuals tracking to roster_slots table
-- Purpose: Track what actually happened vs what was planned

-- Add actuals tracking columns to roster_slots
ALTER TABLE roster_slots
  ADD COLUMN IF NOT EXISTS actual_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS actual_start_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS actual_end_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS actual_tasks_completed TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS substitution_reason TEXT,
  ADD COLUMN IF NOT EXISTS actual_notes TEXT,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS checked_out_by UUID REFERENCES users(id);

-- Add constraint for attendance_status enum values
ALTER TABLE roster_slots
  DROP CONSTRAINT IF EXISTS check_attendance_status;

ALTER TABLE roster_slots
  ADD CONSTRAINT check_attendance_status 
  CHECK (attendance_status IS NULL OR attendance_status IN ('present', 'absent', 'late', 'left_early', 'substituted'));

-- Create index for faster queries on actual_user_id
CREATE INDEX IF NOT EXISTS idx_roster_slots_actual_user_id ON roster_slots(actual_user_id);

-- Create index for faster queries on checked_in_at/checked_out_at
CREATE INDEX IF NOT EXISTS idx_roster_slots_checked_times ON roster_slots(checked_in_at, checked_out_at);

