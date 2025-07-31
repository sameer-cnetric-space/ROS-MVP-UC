// app/api/auth/gmail/callback/route.ts
import { type NextRequest, NextResponse } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

async function getAccountName(
  accountId: string,
  supabase: any,
): Promise<string> {
  try {
    const { data: accountData } = await supabase
      .from('accounts')
      .select('name, slug')
      .eq('id', accountId)
      .single();

    return accountData?.slug || accountData?.name || accountId; // Fallback to accountId if not found
  } catch {
    return accountId; // Fallback to accountId on error
  }
}

export async function GET(request: NextRequest) {
  const logger = await getLogger();
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // This is the account ID
  const error = searchParams.get('error');
  const supabase = getSupabaseServerClient();
  // Log the incoming request
  logger.info('OAuth callback received', {
    hasCode: !!code,
    hasState: !!state,
    error,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
  });

  // Get account name for all redirects
  const accountName = state ? await getAccountName(state, supabase) : 'account';

  // Handle OAuth error from Google
  if (error) {
    logger.error('Gmail OAuth error from Google', { error, state });
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/emails?error=oauth_failed&details=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  // Handle missing code or state
  if (!code || !state) {
    logger.error('Missing OAuth code or state', {
      hasCode: !!code,
      hasState: !!state,
      allParams: Object.fromEntries(searchParams.entries()),
    });
    return NextResponse.redirect(
      new URL(
        `/home/${accountName || 'account'}/emails?error=invalid_request&details=missing_params`,
        request.url,
      ),
    );
  }

  try {
    // Check environment variables first
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:3000/api/auth/gmail/callback';

    logger.info('Environment check', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri,
      state,
    });

    if (!clientId) {
      logger.error('GOOGLE_CLIENT_ID not configured');
      throw new Error('GOOGLE_CLIENT_ID environment variable not set');
    }

    if (!clientSecret) {
      logger.error('GOOGLE_CLIENT_SECRET not configured');
      throw new Error('GOOGLE_CLIENT_SECRET environment variable not set');
    }

    logger.info('Starting token exchange', { state });

    // Exchange code for tokens
    const tokenRequestBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    logger.info('Token request params', {
      hasCode: !!code,
      clientId: clientId.substring(0, 20) + '...',
      redirectUri,
      state,
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody,
    });

    const tokenResponseText = await tokenResponse.text();
    logger.info('Token response received', {
      status: tokenResponse.status,
      ok: tokenResponse.ok,
      headers: Object.fromEntries(tokenResponse.headers.entries()),
      bodyLength: tokenResponseText.length,
      state,
    });

    if (!tokenResponse.ok) {
      logger.error('Token exchange failed', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        responseBody: tokenResponseText,
        state,
      });
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} - ${tokenResponseText}`,
      );
    }

    let tokens;
    try {
      tokens = JSON.parse(tokenResponseText);
    } catch (parseError) {
      logger.error('Failed to parse token response', {
        parseError,
        responseBody: tokenResponseText,
        state,
      });
      throw new Error('Invalid token response format');
    }

    logger.info('Tokens parsed successfully', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      state,
    });

    // Get user info
    logger.info('Fetching user info', { state });
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      const userInfoError = await userInfoResponse.text();
      logger.error('User info fetch failed', {
        status: userInfoResponse.status,
        error: userInfoError,
        state,
      });
      throw new Error(`User info fetch failed: ${userInfoResponse.status}`);
    }

    const userInfo = await userInfoResponse.json();
    logger.info('User info received', {
      email: userInfo.email,
      verified: userInfo.verified_email,
      state,
    });

    // Get current user from Supabase
    logger.info('Getting Supabase user', { state });
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error('Supabase user authentication failed', {
        userError: userError?.message,
        hasUser: !!user,
        state,
      });
      throw new Error(
        `User not authenticated: ${userError?.message || 'No user found'}`,
      );
    }

    logger.info('Supabase user found', {
      userId: user.id,
      userEmail: user.email,
      state,
    });

    // First, try to get existing Gmail tokens
    const { data: existingTokens } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('account_id', state)
      .eq('email_address', userInfo.email)
      .single();

    // Prepare token data
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    const scopeToStore =
      tokens.scope ||
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

    const tokenData = {
      account_id: state,
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt.toISOString(),
      email_address: userInfo.email,
      scope: scopeToStore,
      last_sync: new Date().toISOString(), // Set current timestamp when connecting
      is_active: true, // Set as active when connecting
      sync_status: existingTokens ? existingTokens.sync_status : 'pending', // Keep existing or set to pending
    };

    logger.info('Storing tokens in database', {
      accountId: state,
      userId: user.id,
      email: userInfo.email,
      expiresAt: expiresAt.toISOString(),
      hasCalendarScope: scopeToStore.includes('calendar'),
    });

    // Insert or update Gmail tokens
    const { data: gmailTokens, error: gmailError } = await supabase
      .from('gmail_tokens')
      .upsert(tokenData, {
        onConflict: 'account_id,email_address',
      })
      .select()
      .single();

    if (gmailError) {
      logger.error('Error upserting Gmail tokens', {
        error: gmailError.message,
        code: gmailError.code,
        details: gmailError.details,
        state,
      });

      // Try alternative approach if upsert fails
      logger.info('Trying delete and insert approach', { state });

      // Delete existing record first
      await supabase
        .from('gmail_tokens')
        .delete()
        .eq('account_id', state)
        .eq('email_address', userInfo.email);

      // Then insert new record
      const { error: insertError2 } = await supabase
        .from('gmail_tokens')
        .insert(tokenData);

      if (insertError2) {
        logger.error('Second insert attempt failed', {
          error: insertError2.message,
          state,
        });
        throw new Error(`Database error: ${insertError2.message}`);
      }
    }

    logger.info(
      'Successfully stored Gmail tokens, initializing sync status...',
    );

    // Initialize sync status
    const { error: syncStatusError } = await supabase
      .from('email_sync_status')
      .upsert({
        account_id: state,
        email: userInfo.email,
        status: (existingTokens?.sync_status as string) || 'pending', // Keep existing status or set to pending
        emails_synced: 0,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_by: user.id,
        updated_by: user.id,
      });

    if (syncStatusError) {
      logger.warn('Sync status initialization failed', {
        error: syncStatusError.message,
        state,
      });
      // Don't fail the whole process for this
    }

    logger.info('Triggering initial Gmail sync...');

    // Trigger initial Gmail sync
    try {
      // Construct the base URL from the request to handle both local and production environments
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      const syncUrl = `${baseUrl}/api/gmail/sync`;
      
      logger.info('Gmail sync URL:', { 
        baseUrl, 
        syncUrl, 
        origin: request.nextUrl.origin,
        envUrl: process.env.NEXT_PUBLIC_SITE_URL 
      });

      const syncResponse = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: state,
          email: userInfo.email,
        }),
      });

      if (!syncResponse.ok) {
        console.error(
          'Error triggering initial sync:',
          await syncResponse.text(),
        );
        // Update sync status to failed
        await supabase
          .from('email_sync_status')
          .update({
            status: 'failed',
            error_message: 'Failed to trigger initial sync',
            updated_by: user.id,
          })
          .eq('account_id', state);
      } else {
        console.log('Successfully triggered initial sync');
        // Update sync status to in_progress
        await supabase
          .from('email_sync_status')
          .update({
            status: 'in_progress',
            started_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq('account_id', state);
      }
    } catch (error) {
      console.error('Error triggering initial sync:', error);
      // Update sync status to failed
      await supabase
        .from('email_sync_status')
        .update({
          status: 'failed',
          error_message:
            error instanceof Error ? error.message : 'Unknown sync error',
          updated_by: user.id,
        })
        .eq('account_id', state);
    }

    logger.info('Gmail account connected successfully', {
      accountId: state,
      email: userInfo.email,
      hasCalendarScope: scopeToStore.includes('calendar'),
    });

    // Check if this was an auto-connection attempt
    const isAutoConnect = searchParams.get('auto_connect') === 'true';
    
    // Successful redirect - go to dealflow for auto-connect, emails page for manual connect
    const redirectPath = isAutoConnect 
      ? `/home/${accountName}/dealflow?gmail_connected=true&auto_setup=complete`
      : `/home/${accountName}/emails?connected=true&calendar=${scopeToStore.includes('calendar') ? 'yes' : 'no'}`;
    
    return NextResponse.redirect(
      new URL(redirectPath, request.url),
    );
  } catch (error) {
    // Update sync status to failed if we got far enough to have tokens
    // const supabase = getSupabaseServerClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && state) {
        await supabase.from('email_sync_status').upsert({
          account_id: state,
          email: searchParams.get('email') || 'unknown',
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          updated_by: user.id,
        });
      }
    } catch (syncError) {
      // Ignore sync status update errors during main error handling
    }

    logger.error('OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      state,
      timestamp: new Date().toISOString(),
    });

    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(
      new URL(
        `/home/${state}/emails?error=connection_failed&details=${encodeURIComponent(errorMessage)}`,
        request.url,
      ),
    );
  }
}
