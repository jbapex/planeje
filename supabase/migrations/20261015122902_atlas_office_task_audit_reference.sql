-- Keep the approval audit after a human deletes the operational task normally.
-- The ID is historical evidence, not a second execution or retention mechanism.
BEGIN;
ALTER TABLE public.atlas_office_proposals
  DROP CONSTRAINT atlas_office_proposals_created_task_id_fkey;
COMMENT ON COLUMN public.atlas_office_proposals.created_task_id IS
  'Historical task ID created by this approval; retained when the operational task is deleted.';
COMMIT;
