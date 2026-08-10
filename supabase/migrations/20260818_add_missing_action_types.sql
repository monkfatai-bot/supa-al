-- Phase 9A: Add 4 missing action_type enum values
-- These types are referenced in the automation engine handler registry
-- but were missing from the database enum definition.

ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'update_record';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'create_record';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'ai_generate';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'transform_data';
