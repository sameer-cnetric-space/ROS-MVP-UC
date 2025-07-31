import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CalendarSchedulerService } from '~/lib/services/calendarSchedulerService';

interface Contact {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface DealContact {
  contact_id: string;
  contacts: Contact;
}

type DealContactResponse = {
  contact_id: string;
  contacts: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}[];

export async function POST(request: Request) {
  try {
    // Get account ID from query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Verify account access
    const { data: membership } = await supabase
      .from('accounts_memberships')
      .select('account_role')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to this account' },
        { status: 403 },
      );
    }

    const {
      dealId,
      title,
      startTime,
      endTime,
      description,
      location,
      attendees,
    } = await request.json();

    // Get user's timezone preference
    const { data: userAccount, error: userAccountError } = await supabase
      .from('accounts')
      .select('public_data')
      .eq('primary_owner_user_id', user.id)
      .eq('is_personal_account', true)
      .single();

    let userTimezone = 'UTC'; // Default fallback
    if (!userAccountError && userAccount?.public_data) {
      userTimezone = (userAccount.public_data as any)?.timezone || 'UTC';
    }

    console.log('📅 Using user timezone for event creation:', {
      userId: user.id,
      timezone: userTimezone,
      originalStartTime: startTime,
      originalEndTime: endTime,
      userAccountError,
      userAccountData: userAccount?.public_data,
    });

    console.log('📅 Final event details being passed to calendar service:', {
      startTime,
      endTime,
      timeZone: userTimezone,
    });

    // Get deal details with account filter
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .eq('account_id', accountId)
      .single();

    if (dealError) {
      console.error('Error fetching deal:', dealError);
      return NextResponse.json(
        { error: 'Failed to fetch deal' },
        { status: 500 },
      );
    }

    // Get contacts for the deal through deal_contacts table (from your schema)
    const { data: dealContacts, error: dealContactsError } = await supabase
      .from('deal_contacts')
      .select('*')
      .eq('deal_id', dealId);

    if (dealContactsError) {
      console.error('Error fetching deal contacts:', dealContactsError);
      return NextResponse.json(
        { error: 'Failed to fetch contacts' },
        { status: 500 },
      );
    }

    // Also get separate contacts table if needed
    const { data: separateContacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('deal_id', dealId);

    if (contactsError) {
      console.error('Error fetching contacts:', contactsError);
      // Don't fail the request, just continue without separate contacts
    }

    // Get user's Google tokens from gmail_tokens table
    const { data: gmailToken, error: gmailError } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token')
      .eq('account_id', accountId)
      .single();
    if (gmailError || !gmailToken?.access_token) {
      console.error(
        'Error fetching Google tokens from gmail_tokens:',
        gmailError,
      );

      // More specific error messages based on the type of error
      let errorMessage =
        'Please connect Gmail & Calendar first. Go to Emails → Connect Gmail';

      if (gmailError && gmailError.code === 'PGRST116') {
        errorMessage =
          'No Gmail account connected. Please go to Emails → Connect Gmail & Calendar';
      } else if (gmailToken && !gmailToken.access_token) {
        errorMessage =
          'Gmail connection expired. Please go to Emails → Reconnect Gmail & Calendar';
      }

      return NextResponse.json({ error: errorMessage }, { status: 401 });
    }

    // Extract contact emails from deal_contacts (using the schema structure)
    const contactEmails = (dealContacts || [])
      .map((dc) => ({
        email: dc.email,
        displayName: dc.name,
      }))
      .filter((c) => c.email);

    // Add separate contacts if they exist
    if (separateContacts && separateContacts.length > 0) {
      const additionalEmails = separateContacts.map((contact) => ({
        email: contact.email,
        displayName: contact.name,
      }));
      contactEmails.push(...additionalEmails);
    }

    // Prepare event details for the service
    const scheduler = new CalendarSchedulerService(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      process.env.BASE_URL + '/api/auth/gmail/callback',
    );

    const eventDetails = {
      title,
      description,
      startTime,
      endTime,
      location,
      attendees: [
        ...contactEmails,
        ...(attendees?.map((email: string) => ({ email })) || []),
      ],
      dealId,
      user,
      gmailAccount: {
        access_token: gmailToken.access_token,
        refresh_token: gmailToken.refresh_token,
      },
      timeZone: userTimezone,
    };

    let eventResponse;
    try {
      eventResponse = await scheduler.scheduleEvent(eventDetails);
      console.log('✅ Calendar event created successfully:', eventResponse.id);
    } catch (googleError) {
      console.error('❌ Failed to create calendar event:', googleError);
      return NextResponse.json(
        { error: 'Failed to create calendar event', googleError },
        { status: 500 },
      );
    }

    // Extract meeting link from the created event
    const meetLink =
      eventResponse.conferenceData?.entryPoints?.[0]?.uri || null;
    console.log('🔗 Meeting link extracted:', meetLink);

    // Send meeting to MeetGeek and capture meeting_id
    let meetgeekMeetingId = null;
    if (meetLink) {
      try {
        console.log('🤖 Sending meeting to MeetGeek:', {
          join_link: meetLink,
          meeting_name: title,
          language_code: 'en-US',
          template_name: 'General meeting',
        });

        const meetgeekResponse = await fetch(
          'https://api.meetgeek.ai/v1/bot/join',
          {
            method: 'POST',
            headers: {
              Authorization:
                'Bearer eu-lpSXFFfWR9VPi3I561XeiMcfUyZN9HvO6vjxZ7kGk2zSBapapFVDJkRXachGpAVd2qITBAuQ17kqbiPnA8W9qiwK5CGhpwLi0EhmVQlIFvYjD4jMsbJulmeqYY0Be',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              join_link: meetLink,
              meeting_name: title,
              language_code: 'en-US',
              template_name: 'General meeting',
            }),
          },
        );

        if (meetgeekResponse.ok) {
          const meetgeekResult = await meetgeekResponse.json();
          meetgeekMeetingId =
            meetgeekResult.meeting_id ||
            meetgeekResult.id ||
            meetgeekResult.meetingId;

          if (meetgeekMeetingId) {
            console.log('✅ MeetGeek meeting_id captured:', meetgeekMeetingId);
          } else {
            console.warn(
              "⚠️ MeetGeek response didn't contain meeting_id:",
              meetgeekResult,
            );
          }
        } else {
          const errorText = await meetgeekResponse.text();
          console.error(
            '❌ MeetGeek API error:',
            meetgeekResponse.status,
            errorText,
          );
          
          // Check if this is a subscription error
          if (meetgeekResponse.status === 403 && errorText.includes('paid subscription')) {
            console.log('⚠️ MeetGeek requires paid subscription - continuing without bot');
            // Don't fail the entire process, just continue without MeetGeek bot
          } else {
            // For other errors, we still log but don't fail
            console.log('⚠️ MeetGeek bot invitation failed - continuing without bot');
          }
        }
      } catch (err) {
        console.error('❌ Failed to notify MeetGeek:', err);
      }
    } else {
      console.warn('⚠️ No meeting link available for MeetGeek integration');
    }

    // Store calendar event in calendar_events table
    try {
      const { data: calendarEvent, error: calendarError } = await supabase
        .from('calendar_events')
        .insert({
          account_id: accountId,
          calendar_event_id: eventResponse.id,
          title,
          description,
          start_time: startTime,
          end_time: endTime,
          location,
          meeting_link: meetLink,
          attendees: [
            ...contactEmails.map((c) => ({
              email: c.email,
              name: c.displayName,
            })),
            ...(attendees?.map((email: string) => ({ email })) || []),
          ],
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (calendarError) {
        console.error('❌ Error storing calendar event:', calendarError);
      } else {
        console.log('✅ Calendar event stored in database:', calendarEvent.id);
      }
    } catch (calendarError) {
      console.error('❌ Error storing calendar event:', calendarError);
      // Don't fail the request - meeting was created successfully
    }

    // Store scheduled meeting for MeetGeek tracking
    try {
      const scheduledMeetingData = {
        account_id: accountId,
        deal_id: dealId,
        calendar_event_id: eventResponse.id,
        meeting_title: title,
        meeting_description: description,
        start_time: startTime,
        end_time: endTime,
        attendees: [
          ...contactEmails.map((c) => ({
            email: c.email,
            name: c.displayName,
          })),
          ...(attendees?.map((email: string) => ({ email })) || []),
        ],
        meeting_link: meetLink,
        meetgeek_meeting_id: meetgeekMeetingId,
        status: meetgeekMeetingId ? 'linked' : 'scheduled',
        created_by: user.id,
        updated_by: user.id,
      };

      console.log('📝 Inserting scheduled meeting data:', scheduledMeetingData);

      const { data: scheduledMeeting, error: trackingError } = await supabase
        .from('scheduled_meetings')
        .insert(scheduledMeetingData)
        .select()
        .single();

      if (trackingError) {
        console.error('❌ Error tracking scheduled meeting:', trackingError);
      } else {
        console.log(
          `✅ Tracked scheduled meeting for deal ${dealId}, calendar event ${eventResponse.id}, MeetGeek ID: ${meetgeekMeetingId || 'none'}`,
        );
      }
    } catch (trackingError) {
      console.error('❌ Error tracking scheduled meeting:', trackingError);
      // Don't fail the request - meeting was created successfully
    }

    // Update deal with meeting details (optional, can be removed if not needed)
    try {
      await supabase
        .from('deals')
        .update({
          last_meeting_date: startTime,
          last_meeting_type: 'scheduled',
          last_meeting_notes: description,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', dealId)
        .eq('account_id', accountId);

      console.log(`✅ Updated deal ${dealId} with meeting details`);
    } catch (updateError) {
      console.error('❌ Error updating deal:', updateError);
      // Don't return error here, as the meeting was created successfully
    }

    return NextResponse.json({
      success: true,
      eventId: eventResponse.id,
      calendar_event_id: eventResponse.id,
      meetLink: meetLink,
      meeting_link: meetLink,
      meetgeekMeetingId: meetgeekMeetingId || null,
      message: 'Meeting scheduled successfully',
    });
  } catch (error) {
    console.error('❌ Error in create-event:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
