-- ============================================================
-- TableKey – Add new enum values for roles and audit actions
-- Must run BEFORE 005 (PostgreSQL can't use new enum values
-- in the same transaction they were added)
-- ============================================================

-- Add 'owner' and 'manager' to staff_role
alter type staff_role add value if not exists 'owner';
alter type staff_role add value if not exists 'manager';

-- Add new audit actions
alter type audit_action add value if not exists 'owner_signup';
alter type audit_action add value if not exists 'pin_set';
alter type audit_action add value if not exists 'pin_reset';
alter type audit_action add value if not exists 'pin_login_success';
alter type audit_action add value if not exists 'pin_login_failed';
alter type audit_action add value if not exists 'device_paired';
alter type audit_action add value if not exists 'device_unpaired';
alter type audit_action add value if not exists 'device_locked';
alter type audit_action add value if not exists 'role_changed';
alter type audit_action add value if not exists 'staff_deactivated';
alter type audit_action add value if not exists 'staff_activated';
alter type audit_action add value if not exists 'table_assigned';
alter type audit_action add value if not exists 'table_unassigned';
alter type audit_action add value if not exists 'duty_on';
alter type audit_action add value if not exists 'duty_off';
alter type audit_action add value if not exists 'ownership_transferred';
