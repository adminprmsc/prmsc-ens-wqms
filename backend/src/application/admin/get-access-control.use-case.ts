import { Injectable } from '@nestjs/common';
import { USER_ROLE_LABELS, UserRole } from '../../domain/user/user';

export type RolePermission = {
  role: UserRole;
  label: string;
  description: string;
  permissions: string[];
};

@Injectable()
export class GetAccessControlUseCase {
  execute(): { roles: RolePermission[] } {
    return {
      roles: [
        {
          role: UserRole.SYSTEM_ADMIN,
          label: USER_ROLE_LABELS[UserRole.SYSTEM_ADMIN],
          description: 'Full platform administrator for WQMS.',
          permissions: [
            'create_users',
            'activate_deactivate_users',
            'reset_credentials',
            'view_all_audit_history',
            'manage_access_control',
            'assign_roles',
          ],
        },
        {
          role: UserRole.SUPER_ADMIN,
          label: USER_ROLE_LABELS[UserRole.SUPER_ADMIN],
          description: 'PRMSC Manager for operational oversight.',
          permissions: [
            'manage_prmsc_operations',
            'view_assigned_reports',
            'manage_team_workflows',
            'review_water_quality_reports',
            'approve_reject_reports',
          ],
        },
        {
          role: UserRole.USER,
          label: USER_ROLE_LABELS[UserRole.USER],
          description: 'PCRWR User for day-to-day water quality work.',
          permissions: [
            'submit_field_data',
            'view_assigned_records',
            'update_own_profile',
            'create_water_quality_reports',
            'submit_reports_for_review',
          ],
        },
      ],
    };
  }
}
