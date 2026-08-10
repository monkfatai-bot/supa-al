import type { UserSettings } from '@/types/generated/database';

export interface SettingsUpdateData {
  theme?: string;
  language?: string;
  email_notifications?: boolean;
  workspace_notifications?: boolean;
  security_alerts?: boolean;
  active_workspace_id?: string | null;
}

export type { UserSettings };
