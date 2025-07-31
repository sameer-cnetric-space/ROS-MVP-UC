import {
  Building2,
  Calendar,
  CreditCard,
  Mail,
  Merge,
  Settings,
  Users,
} from 'lucide-react';

import { NavigationConfigSchema } from '@kit/ui/navigation-schema';

import featureFlagsConfig from '~/config/feature-flags.config';
import pathsConfig from '~/config/paths.config';

const iconClasses = 'w-4';

const getRoutes = (account: string) => [
  {
    label: 'common:routes.application',
    children: [
      {
        label: 'common:routes.dealflow',
        path: createPath(pathsConfig.app.accountDealflow, account),
        Icon: <Building2 className={iconClasses} />,
      },
      {
        label: 'common:routes.meetings',
        path: createPath(pathsConfig.app.accountMeetings, account),
        Icon: <Calendar className={iconClasses} />,
      },
      {
        label: 'common:routes.emails',
        path: createPath(pathsConfig.app.accountEmails, account),
        Icon: <Mail className={iconClasses} />,
      },
    ],
  },
  {
    label: 'common:routes.settings',
    collapsible: false,
    children: [
      {
        label: 'common:routes.settings',
        path: createPath(pathsConfig.app.accountSettings, account),
        Icon: <Settings className={iconClasses} />,
      },
      {
        label: 'common:routes.integrations',
        path: createPath(pathsConfig.app.accountIntegrations, account),
        Icon: <Merge className={iconClasses} />,
      },
      {
        label: 'common:routes.members',
        path: createPath(pathsConfig.app.accountMembers, account),
        Icon: <Users className={iconClasses} />,
      },
      featureFlagsConfig.enableTeamAccountBilling
        ? {
            label: 'common:routes.billing',
            path: createPath(pathsConfig.app.accountBilling, account),
            Icon: <CreditCard className={iconClasses} />,
          }
        : undefined,
      {
        label: 'common:routes.account',
        path: createPath('/home/[account]/user-settings', account),
        Icon: <Users className={iconClasses} />,
      },
    ].filter(Boolean),
  },
];

export function getTeamAccountSidebarConfig(account: string) {
  return NavigationConfigSchema.parse({
    routes: getRoutes(account),
    style: process.env.NEXT_PUBLIC_TEAM_NAVIGATION_STYLE,
    sidebarCollapsed: process.env.NEXT_PUBLIC_TEAM_SIDEBAR_COLLAPSED,
    sidebarCollapsedStyle: process.env.NEXT_PUBLIC_SIDEBAR_COLLAPSIBLE_STYLE,
  });
}

function createPath(path: string, account: string) {
  return path.replace('[account]', account);
}
