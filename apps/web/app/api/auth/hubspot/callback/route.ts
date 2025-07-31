// app/api/auth/hubspot/callback/route.ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');

  console.log('HubSpot callback - Code:', code?.substring(0, 10) + '...');
  console.log('HubSpot callback - State:', state);

  const cookieStore = await cookies();
  const storedRandomState = cookieStore.get('hubspot_oauth_state')?.value;

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
      new URL('/import/hubspot?error=authentication_required', request.url),
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
    console.error('HubSpot OAuth error:', error);
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/hubspot?error=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  if (!code || !state) {
    console.error('Missing code or state');
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/hubspot?error=missing_code_or_state`,
        request.url,
      ),
    );
  }

  // Verify state matches what we stored and account ID is present
  if (receivedRandomState !== storedRandomState || !accountId) {
    console.error('Invalid state or missing account ID');
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/hubspot?error=invalid_state`,
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
        `/home/${accountName}/import/hubspot?error=access_denied`,
        request.url,
      ),
    );
  }

  try {
    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing HubSpot credentials');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/hubspot/callback`,
        code,
      }),
    });

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

    // Get user info from HubSpot
    let userInfo = null;
    try {
      const userResponse = await fetch(
        'https://api.hubapi.com/crm/v3/owners/me',
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
        console.warn('Failed to get user info from HubSpot');
      }
    } catch (userError) {
      console.warn('User info fetch error:', userError);
    }

    // Store tokens in database using the account ID from state
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const { error: dbError } = await supabase.from('hubspot_tokens').upsert({
      account_id: accountId,
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt.toISOString(),
      email_address: userInfo?.email || null,
      api_domain: 'https://api.hubapi.com',
      user_info: userInfo || {},
      scope:
        tokens.scope ||
        'crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read',
    });

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to store tokens: ${dbError.message}`);
    }

    console.log('Tokens stored successfully');

    // Clear cookie
    cookieStore.delete('hubspot_oauth_state');

    // Redirect to account-specific import page
    console.log(`Redirecting to: /home/${accountName}/import/hubspot`);

    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/hubspot?connected=true&user_id=${user.id}`,
        request.url,
      ),
    );
  } catch (error) {
    console.error('HubSpot OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/home/${accountName}/import/hubspot?error=connection_failed`,
        request.url,
      ),
    );
  }
}
