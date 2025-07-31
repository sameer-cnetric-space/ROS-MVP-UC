import { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { If } from '@kit/ui/if';
import { PageBody } from '@kit/ui/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Trans } from '@kit/ui/trans';

import { createI18nServerInstance } from '~/lib/i18n/i18n.server';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { loadTeamWorkspace } from '../_lib/server/team-account-workspace.loader';
import EmailList from './_components/email-list';
import { GmailConnectButton } from './_components/gmail-connect-button';
import SyncButton from './_components/sync-button';
import { getDealRelatedEmails } from './_lib/actions/gmail';
import { getGmailIntegrationStatus } from './_lib/server/emails.service';

export const generateMetadata = async () => {
  const i18n = await createI18nServerInstance();
  const title = i18n.t('common:emails');

  return {
    title,
  };
};

interface DealContext {
  contact: {
    id: string;
    name: string;
    email: string;
    role: string;
    is_decision_maker: boolean;
  };
  deal: {
    id: string;
    company_name: string;
    stage: string;
    value: string;
  };
}

interface DealEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_email: string;
  to_email: string[] | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  dealContext?: DealContext[];
}

export default async function EmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Get account ID from workspace
  const resolvedParams = await params;
  const account = resolvedParams.account;

  // Get the current team workspace to access the account ID
  const workspace = await loadTeamWorkspace(account);
  const accountId = workspace.account.id;

  // Get the current user
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/auth/login');
  }

  // Get Gmail integration status
  const integrationStatus = await getGmailIntegrationStatus(accountId);

  // Await searchParams before using
  const resolvedSearchParams = await searchParams;

  // Get deal-related emails
  const limit = 20;
  const offset = resolvedSearchParams.offset
    ? parseInt(resolvedSearchParams.offset as string, 10)
    : 0;
  const search = (resolvedSearchParams.search as string) || '';
  const dealId = (resolvedSearchParams.dealId as string) || '';

  const emailsResponse = await getDealRelatedEmails(accountId, {
    limit,
    offset,
    search,
    dealId,
  });

  const emails: DealEmail[] = emailsResponse.success
    ? emailsResponse.emails || []
    : [];

  // Get all deals for the filter dropdown
  const {
    data: deals,
  }: { data: { id: string; company_name: string; stage: string }[] | null } =
    await supabase
      .from('deals')
      .select('id, company_name, stage')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

  // Check if account has Gmail connected
  const { data: gmailTokens } = await supabase
    .from('gmail_tokens')
    .select('email_address, expires_at')
    .eq('account_id', accountId);

  const hasGmailConnected = !!(gmailTokens && gmailTokens.length > 0);

  // Get sync status
  const { data: syncStatus } = await supabase
    .from('email_sync_status')
    .select('status, completed_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey={'common:emails'} />}
        description={<AppBreadcrumbs />}
      />

      <PageBody>
        <If condition={!integrationStatus.isConnected}>
          <Alert>
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>
                  Connect a Gmail account to get started with email management
                  and deal communication tracking.
                </span>
                <GmailConnectButton accountId={accountId} />
              </div>
            </AlertDescription>
          </Alert>
        </If>

        <If condition={integrationStatus.isConnected}>
          <div className="container pb-10">
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Deal Emails
                  </h1>
                  <p className="text-muted-foreground mt-2">
                    View and manage emails related to your deals and contacts.
                  </p>
                </div>

                {/* Manual Sync Button */}
                <SyncButton
                  accountId={accountId}
                  hasGmailConnected={hasGmailConnected}
                  gmailEmail={gmailTokens?.[0]?.email_address}
                  syncStatus={syncStatus?.status}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <Tabs defaultValue="all-deals">
                  <TabsList className="mb-4">
                    <TabsTrigger value="all-deals">All Deal Emails</TabsTrigger>
                    <TabsTrigger value="recent">Recent</TabsTrigger>
                    <TabsTrigger value="starred">Starred</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all-deals" className="space-y-4">
                    <EmailList emails={emails} />
                  </TabsContent>

                  <TabsContent value="recent" className="space-y-4">
                    <div className="text-muted-foreground py-10 text-center">
                      Recent emails will appear here.
                    </div>
                  </TabsContent>

                  <TabsContent value="starred" className="space-y-4">
                    <div className="text-muted-foreground py-10 text-center">
                      Starred emails will appear here.
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-6">
                {/* Deal Filter */}
                {deals && deals.length > 0 && (
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Filter by Deal</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="space-y-1">
                        <a
                          href={`/home/${account}/emails`}
                          className={`block rounded-md p-2 text-sm transition-colors ${
                            !dealId ? 'bg-muted' : 'hover:bg-muted'
                          }`}
                        >
                          All Deals
                        </a>
                        {deals.map((deal) => (
                          <a
                            key={deal.id}
                            href={`/home/${account}/emails?dealId=${deal.id}`}
                            className={`block rounded-md p-2 text-sm transition-colors ${
                              dealId === deal.id ? 'bg-muted' : 'hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate">
                                {deal.company_name}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {deal.stage}
                              </Badge>
                            </div>
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}


              </div>
            </div>
          </div>
        </If>
      </PageBody>
    </>
  );
}
