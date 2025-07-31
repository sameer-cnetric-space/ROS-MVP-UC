'use server';

import { z } from 'zod';

import { enhanceAction } from '@kit/next/actions';
import { getLogger } from '@kit/shared/logger';

import { syncGmailEmails } from './emails.service';
import { testGmailSync } from './test-sync';

const ConnectGmailSchema = z.object({
  accountId: z.string().min(1),
});

const SyncEmailsSchema = z.object({
  accountId: z.string().min(1),
});

/**
 * Start Gmail OAuth flow
 */
export const connectGmailAction = enhanceAction(
  async function (data) {
    const { accountId } = data;

    try {
      // Generate OAuth URL
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const logger = await getLogger();

      logger.info('Gmail OAuth attempt', {
        accountId,
        hasClientId: !!clientId,
        clientIdLength: clientId?.length,
      });

      if (!clientId) {
        throw new Error('Google Client ID not configured');
      }

      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        // ✅ NEW: Calendar permissions
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ];

      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:3000/api/auth/gmail/callback';

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', accountId); // Pass account ID in state

      logger.info('Generated Google OAuth URL', {
        authUrl: authUrl.toString(),
        accountId,
      });

      // Return the URL for client-side redirect
      return {
        success: true,
        redirectUrl: authUrl.toString(),
      };
    } catch (error) {
      const logger = await getLogger();

      logger.error('Failed to start Gmail OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        accountId,
      });
      return {
        success: false,
        error: 'Failed to start Gmail connection process',
      };
    }
  },
  {
    auth: true,
    schema: ConnectGmailSchema,
  },
);

/**
 * Trigger email sync for account
 */
export const syncEmailsAction = enhanceAction(
  async function (data) {
    const { accountId } = data;

    try {
      const logger = await getLogger();
      logger.info('Email sync requested', { accountId });

      // First, run diagnostic test
      const testResult = await testGmailSync(accountId);
      logger.info('Sync test result', testResult);

      if (!testResult.success) {
        return {
          success: false,
          error: `Sync test failed: ${testResult.error}`,
        };
      }

      if (!testResult.hasTokens) {
        return {
          success: false,
          error: 'No Gmail account connected for this team',
        };
      }

      // Actually sync emails from Gmail
      const result = await syncGmailEmails(accountId);

      if (result.success) {
        return {
          success: true,
          message: `Synced ${result.emailsSynced} new emails`,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to sync emails',
        };
      }
    } catch (error) {
      const logger = await getLogger();
      logger.error('Failed to start email sync', { error, accountId });
      return {
        success: false,
        error: 'Failed to start email sync',
      };
    }
  },
  {
    auth: true,
    schema: SyncEmailsSchema,
  },
);
