// app/api/auth/salesforce/callback/route.ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');

  console.log('Salesforce callback - Code:', code?.substring(0, 10) + '...');
  console.log('Salesforce callback - State:', state);

  const cookieStore = await cookies();
  const storedRandomState = cookieStore.get('salesforce_oauth_state')?.value;

  console.log('Stored random state:', storedRandomState);

  // Verify user is still authenticated
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Authentication error:', authError);
    return NextResponse.redirect(
      new URL('/import/salesforce?error=authentication_required', request.url),
    );
  }

  // Extract account_id from state parameter
  let accountId: string | null = null;
  let receivedRandomState: string | null = null;

  if (state) {
    const stateParts = state.split(':');
    if (stateParts.length === 2) {
      accountId = stateParts[0] || null;
      receivedRandomState = stateParts[1] || null;
    }
  }

  console.log('Account ID from state:', accountId);
  console.log('Received random state:', receivedRandomState);

  // Get account name from database using account ID
  let accountName = 'default'; // fallback

  if (accountId) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('slug, name')
      .eq('id', accountId)
      .single();

    if (!accountError && account) {
      // Use slug if available, otherwise use name
      accountName = account.slug || account.name;
      console.log('Found account:', { slug: account.slug, name: account.name });
      console.log('Using account name for redirect:', accountName);
    } else {
      console.error('Failed to get account details:', accountError);
    }
  } else {
    console.error('No account ID found in state parameter');
  }

  if (error) {
    console.error('Salesforce OAuth error:', error);
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/salesforce?error=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  if (!code || !state) {
    console.error('Missing code or state');
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/salesforce?error=missing_code_or_state`,
        request.url,
      ),
    );
  }

  // Verify state matches what we stored and account ID is present
  if (receivedRandomState !== storedRandomState || !accountId) {
    console.error('Invalid state or missing account ID');
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/salesforce?error=invalid_state`,
        request.url,
      ),
    );
  }

  // Verify user still has access to this account
  const { data: membership } = await supabase
    .from('accounts_memberships')
    .select('*')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    console.error('User no longer has access to account');
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/salesforce?error=access_denied`,
        request.url,
      ),
    );
  }

  try {
    const clientId = process.env.NEXT_PUBLIC_SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing Salesforce credentials');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(
      'https://login.salesforce.com/services/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/salesforce/callback`,
          code,
        }),
      },
    );

    console.log('Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange error response:', errorText);
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} ${errorText}`,
      );
    }

    const tokens = await tokenResponse.json();
    console.log('Received tokens successfully');

    // Get user info from Salesforce
    let userInfo = null;
    try {
      const userResponse = await fetch(
        `${tokens.instance_url}/services/oauth2/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        },
      );

      if (userResponse.ok) {
        userInfo = await userResponse.json();
        console.log('User info:', userInfo?.email);
      } else {
        console.warn('Failed to get user info from Salesforce');
      }
    } catch (userError) {
      console.warn('User info fetch error:', userError);
    }

    // Store tokens in database using the account ID from state
    // Salesforce tokens don't have expires_in, they're long-lived
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default

    const { error: dbError } = await supabase.from('salesforce_tokens').upsert({
      account_id: accountId,
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt.toISOString(),
      email_address: userInfo?.email || null,
      api_domain: tokens.instance_url,
      user_info: userInfo || {},
      scope: tokens.scope || 'api refresh_token id',
    });

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to store tokens: ${dbError.message}`);
    }

    console.log('Tokens stored successfully');

    // Clear cookie
    cookieStore.delete('salesforce_oauth_state');

    // Redirect to account-specific import page
    console.log(`Redirecting to: /home/${accountName}/import/salesforce`);

    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/salesforce?connected=true&user_id=${user.id}`,
        request.url,
      ),
    );
  } catch (error) {
    console.error('Salesforce OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/salesforce?error=connection_failed`,
        request.url,
      ),
    );
  }
}
