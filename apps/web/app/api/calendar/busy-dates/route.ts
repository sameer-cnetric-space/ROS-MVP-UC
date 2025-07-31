// import { cookies } from "next/headers";
import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

// import { format, parseISO } from "date-fns";
// import { toZonedTime } from "date-fns-tz";
import { groupEventsByDate } from '~/features/busyTimes';
import { refreshGoogleToken } from '~/features/gmail/utils';

const CENTRAL_TZ = 'America/Chicago';

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServerClient();

    // Get accountId from query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account ID is required',
        },
        { status: 400 },
      );
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User authentication error:', userError);
      return NextResponse.json(
        {
          success: false,
          error: 'User not authenticated',
        },
        { status: 401 },
      );
    }
    console.log('✅ Authenticated user:', user.email || user.id);

    // Verify account access
    const { data: membership, error: membershipError } = await supabase
      .from('accounts_memberships')
      .select('account_role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        {
          success: false,
          error: 'Access denied to this account',
        },
        { status: 403 },
      );
    }

    // Fetch Google OAuth tokens from gmail_tokens (updated table name)
    const { data: gmailToken, error: gmailError } = await supabase
      .from('gmail_tokens')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (gmailError || !gmailToken) {
      console.error('Error fetching Gmail token:', gmailError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch Gmail token',
      });
    }
    console.log(
      '✅ Found Gmail token for user:',
      gmailToken.email_address || gmailToken.id,
    );

    let googleAccessToken = gmailToken?.access_token;
    let googleRefreshToken = gmailToken?.refresh_token;
    let tokenExpiry = gmailToken?.expires_at
      ? new Date(gmailToken.expires_at)
      : null;

    // Refresh token if expired
    if (tokenExpiry && tokenExpiry < new Date() && googleRefreshToken) {
      try {
        const refreshed = await refreshGoogleToken(googleRefreshToken);
        if (refreshed.access_token && refreshed.expires_at) {
          googleAccessToken = refreshed.access_token;
          tokenExpiry = new Date(refreshed.expires_at);
          // Update the DB with the new token/expiry
          await supabase
            .from('gmail_tokens')
            .update({
              access_token: googleAccessToken,
              expires_at: tokenExpiry.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', gmailToken.id);
          console.log('🔄 Refreshed Google access token.');
        }
      } catch (err) {
        console.error('Failed to refresh Google token:', err);
        return NextResponse.json({
          success: false,
          error: 'Failed to refresh Google token',
        });
      }
    }

    if (!googleAccessToken) {
      console.error('No Google access token available');
      return NextResponse.json({
        success: false,
        error: 'No valid Google access token available',
      });
    }

    // Verify token scopes
    const tokenInfoResponse = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${googleAccessToken}`,
    );
    if (tokenInfoResponse.ok) {
      const tokenInfo = await tokenInfoResponse.json();
      console.log('Token scopes:', tokenInfo.scope);
      // Check if we have the necessary scopes
      const requiredScopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ];
      const missingScopes = requiredScopes.filter(
        (scope) => !tokenInfo.scope.includes(scope),
      );
      if (missingScopes.length > 0) {
        console.error('Missing required scopes:', missingScopes);
        return NextResponse.json({
          success: false,
          error: `Missing required Google Calendar scopes: ${missingScopes.join(
            ', ',
          )}`,
        });
      }
    } else {
      const errorText = await tokenInfoResponse.text();
      console.error('Failed to verify token scopes:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Failed to verify Google token scopes',
      });
    }

    // Fetch Google Calendar events
    let googleEvents: { start: string; end: string }[] = [];
    if (googleAccessToken) {
      const now = new Date();
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        maxResults: '250',
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      console.log('Fetching Google Calendar events...');
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('Google Calendar API status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log(
          'Google Calendar events:',
          data.items?.length || 0,
          'events found',
        );
        googleEvents = (data.items || [])
          .filter((item: any) => item.start?.dateTime && item.end?.dateTime)
          .map((item: any) => ({
            start: item.start.dateTime,
            end: item.end.dateTime,
          }));
        console.log('Parsed Google events:', googleEvents.length, 'events');
      } else {
        const errorText = await response.text();
        console.error('Google Calendar API error:', errorText);
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch Google Calendar events',
        });
      }
    }

    // Fetch internal events from our database
    const { data: calendarEvents, error: calendarError } = await supabase
      .from('calendar_events')
      .select('start_time, end_time')
      .eq('account_id', accountId)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    if (calendarError) {
      console.error('Error fetching calendar events:', calendarError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch calendar events',
      });
    }
    console.log('✅ Internal calendar events:', calendarEvents.length);

    // Merge Google and internal events
    const allEvents = [
      ...googleEvents.map((e) => ({ start: e.start, end: e.end })),
      ...calendarEvents.map((event: any) => ({
        start: event.start_time,
        end: event.end_time,
      })),
    ];

    console.log('All merged events:', allEvents);

    const busyTimes = groupEventsByDate(allEvents, CENTRAL_TZ);

    return NextResponse.json({
      success: true,
      busyTimes,
    });
  } catch (error) {
    console.error('Error in busy-dates route:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
