// app/api/auth/zoho/route.ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { randomUUID } from 'crypto';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const SCOPES = ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.READ'];

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const accountId = requestUrl.searchParams.get('accountId');

  // Verify user is authenticated and has access to the account
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
  }

  // Verify user has access to this account
  const { data: membership } = await supabase
    .from('accounts_memberships')
    .select('*')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Create state with embedded account_id and random UUID for security
  const randomState = randomUUID();
  const state = `${accountId}:${randomState}`;

  const cookieStore = await cookies();

  // Store only the random part of state in cookies for verification
  cookieStore.set('zoho_oauth_state', randomState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  const clientId = process.env.NEXT_PUBLIC_ZOHO_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/zoho/callback`;

  if (!clientId) {
    return NextResponse.json({ error: 'Client ID missing' }, { status: 500 });
  }

  const params = new URLSearchParams({
    scope: SCOPES.join(' '),
    client_id: clientId,
    response_type: 'code',
    access_type: 'offline',
    redirect_uri: redirectUri,
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(
    new URL(`https://accounts.zoho.in/oauth/v2/auth?${params.toString()}`),
  );
}
