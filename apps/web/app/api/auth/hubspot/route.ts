// app/api/auth/hubspot/route.ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { randomUUID } from 'crypto';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const SCOPES = ['oauth'];
const optionalScopes = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  // 'crm.objects.companies.read',
  // 'crm.objects.companies.write',
];

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
  cookieStore.set('hubspot_oauth_state', randomState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID missing' }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/hubspot/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    optional_scope: optionalScopes.join(' '),
    state,
  });

  // Create a temporary page that redirects (keeping your nice UX)
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Connecting to HubSpot...</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #ff7a00, #ff9500);
          margin: 0;
          padding: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
        }
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #ff7a00;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        h2 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔗 Connecting to HubSpot</h2>
        <p>Setting up your integration...</p>
        <div class="spinner"></div>
      </div>
      <script>
        // Redirect to HubSpot OAuth
        window.location.href = 'https://app.hubspot.com/oauth/authorize?${params.toString()}';
      </script>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
