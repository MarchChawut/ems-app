-- Makes `type` nullable so admin-created dynamic form templates (no matching
-- FormRequestType enum value) can be submitted through /api/form-requests.

-- AlterTable
ALTER TABLE `form_requests` MODIFY `type` ENUM('VEHICLE_REQUEST', 'REFRESHMENT_REQUEST', 'MEETING_ROOM_REQUEST', 'SPEAKER_REQUEST') NULL;
