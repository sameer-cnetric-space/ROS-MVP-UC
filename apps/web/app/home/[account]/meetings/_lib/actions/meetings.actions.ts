'use server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function getMeetings(accountId: string) {
  try {
    const supabase = getSupabaseServerClient();

    // Verify account exists and user has access
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      console.error('Account not found:', accountError);
      return {
        success: false,
        error: 'Account not found or inaccessible',
        meetings: [],
      };
    }

    console.log(`📋 Getting meetings for account: ${account.name}`);

    // Get account's deals to filter meetings
    const { data: accountDeals, error: dealsError } = await supabase
      .from('deals')
      .select('id, company_name')
      .eq('account_id', accountId);

    if (dealsError) {
      console.error('Error fetching account deals:', dealsError);
      return {
        success: false,
        error: 'Failed to fetch account deals',
        meetings: [],
      };
    }

    const dealIds = accountDeals?.map((deal) => deal.id) || [];
    console.log(`🎯 Found ${dealIds.length} deals for account:`, dealIds);
    console.log(
      `🎯 Deal details:`,
      accountDeals?.map((d) => ({ id: d.id, name: d.company_name })),
    );

    // Fetch actual meeting data with transcripts
    const { data: meetingsData, error: meetingsError } = await supabase
      .from('meetings')
      .select('*')
      .eq('account_id', accountId)
      .in('deal_id', dealIds)
      .order('timestamp_start_utc', { ascending: false });

    if (meetingsError) {
      console.error('Error fetching meetings:', meetingsError);
    }

    // Fetch scheduled meetings (MeetGeek integration) - filter by account's deals
    const { data: scheduledMeetings, error: scheduledError } = await supabase
      .from('scheduled_meetings')
      .select('*')
      .eq('account_id', accountId)
      .in('deal_id', dealIds)
      .order('start_time', { ascending: false });

    // Create a mapping from MeetGeek ID to database meeting ID for transcript lookup
    const meetgeekToDbIdMap: Record<string, string> = {};
    if (meetingsData) {
      meetingsData.forEach((meeting: any) => {
        if (meeting.meeting_id) {
          // meeting_id is the MeetGeek ID in meetings table
          meetgeekToDbIdMap[meeting.meeting_id] = meeting.id; // Map MeetGeek ID to database ID
        }
      });
    }
    console.log('🗺️ MeetGeek to DB ID mapping:', meetgeekToDbIdMap);

    if (scheduledError) {
      console.error('Error fetching scheduled meetings:', scheduledError);
    }

    // Get transcript counts for each meeting through proper access control
    // We need to join with meetings table to respect RLS policies
    const { data: transcriptData, error: transcriptError } = await supabase
      .from('transcripts')
      .select(
        `
        meeting_id,
        meetings!inner(
          id,
          deal_id,
          account_id
        )
      `,
      )
      .eq('account_id', accountId)
      .in('meetings.deal_id', dealIds);

    // Get meeting summaries from the summaries table
    const { data: summariesData, error: summariesError } = await supabase
      .from('summaries')
      .select('meeting_id, summary')
      .eq('account_id', accountId);

    let meetingSummaries: Record<string, string> = {};
    if (!summariesError && summariesData) {
      summariesData.forEach((s: any) => {
        meetingSummaries[s.meeting_id] = s.summary;
      });
      console.log('📝 Found summaries for meetings:', Object.keys(meetingSummaries));
    } else if (summariesError) {
      console.error('Error fetching meeting summaries:', summariesError);
    }

    let transcriptCounts: Record<string, number> = {};
    if (transcriptError) {
      console.error('Error fetching transcript counts:', transcriptError);
      console.log('Trying alternative transcript query method...');

      // Fallback: query transcripts for each meeting individually
      if (meetingsData && meetingsData.length > 0) {
        for (const meeting of meetingsData) {
          const { data: meetingTranscripts, error: meetingTranscriptError } =
            await supabase
              .from('transcripts')
              .select('id')
              .eq('meeting_id', meeting.id)
              .eq('account_id', accountId);

          if (!meetingTranscriptError && meetingTranscripts) {
            transcriptCounts[meeting.id] = meetingTranscripts.length;
          }
        }
        console.log(
          '📊 Transcript counts (fallback method):',
          transcriptCounts,
        );
      }
    } else if (transcriptData) {
      // Count transcripts by meeting_id
      transcriptData.forEach((t: any) => {
        transcriptCounts[t.meeting_id] =
          (transcriptCounts[t.meeting_id] || 0) + 1;
      });
      console.log('📊 Transcript counts by meeting_id:', transcriptCounts);
    }

    console.log(
      `📝 Found transcripts for ${Object.keys(transcriptCounts).length} meetings`,
    );

    let allMeetings: any[] = [];

    // Transform actual meetings data
    if (meetingsData && meetingsData.length > 0) {
      const transformedMeetings = meetingsData.map((meeting: any) => {
        const startDate = meeting.timestamp_start_utc;
        const endDate = meeting.timestamp_end_utc;
        const duration =
          endDate && startDate
            ? Math.round(
                (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                  (1000 * 60),
              )
            : 60;

        const participants = Array.isArray(meeting.participant_emails)
          ? meeting.participant_emails
          : [];

        // Check for transcripts using database meeting ID
        const hasTranscript = !!((transcriptCounts[meeting.id] || 0) > 0);
        const hasSummary = !!meetingSummaries[meeting.id];
        const summary = meetingSummaries[meeting.id];
        
        console.log(
          `🔍 Meeting ${meeting.id}: hasTranscript=${hasTranscript}, transcriptCount=${transcriptCounts[meeting.id] || 0}, hasSummary=${hasSummary}`,
        );

        return {
          id: meeting.id,
          dealId: meeting.deal_id,
          dealName: meeting.title || 'Meeting',
          date: startDate,
          impact: hasSummary ? ('progress' as const) : hasTranscript ? ('progress' as const) : ('neutral' as const),
          momentum: hasSummary ? 50 : hasTranscript ? 25 : 0,
          keyOutcome: summary || meeting.title || 'Meeting completed',
          decisions: [],
          actionItems: [],
          insights: [
            `Host: ${meeting.host_email || 'Unknown'}`,
            `Duration: ${duration} minutes`,
            `Language: ${meeting.language || 'en-US'}`,
            ...(hasTranscript
              ? [
                  `📝 Transcript available (${transcriptCounts[meeting.id]} segments)`,
                ]
              : []),
            ...(hasSummary
              ? [`✨ MeetGeek summary available`]
              : []),
          ],
          participants:
            participants.length > 0
              ? participants
              : [meeting.host_email || 'Unknown'],
          duration: duration,
          transcriptAvailable: hasTranscript,
          recordingAvailable: !!meeting.recording_url,
          keyInsightSnippet: hasSummary
            ? summary
            : hasTranscript
              ? `Meeting with transcript - click to view details`
              : `Meeting completed - processing data`,
          meetingSummary: summary, // Add the full summary for the details panel
        };
      });

      allMeetings.push(...transformedMeetings);
    }

    // Transform scheduled meetings
    if (scheduledMeetings && scheduledMeetings.length > 0) {
      const transformedScheduled = scheduledMeetings.map((scheduled: any) => {
        const startDate = scheduled.start_time;
        const endDate = scheduled.end_time;
        const duration =
          endDate && startDate
            ? Math.round(
                (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                  (1000 * 60),
              )
            : 60;

        const attendees = Array.isArray(scheduled.attendees)
          ? scheduled.attendees
          : [];
        const participants = attendees
          .map((a: any) => a.email || a.displayName || 'Unknown')
          .filter(Boolean);
        const isCompleted = scheduled.status === 'completed';

        // Check for transcripts using correct database meeting ID
        const meetgeekId = scheduled.meetgeek_meeting_id;
        const dbMeetingId = meetgeekId ? meetgeekToDbIdMap[meetgeekId] : null;
        const hasTranscriptViaMeetgeek = dbMeetingId
          ? !!((transcriptCounts[dbMeetingId] || 0) > 0)
          : false;
        console.log(
          `🔍 Scheduled meeting ${scheduled.id}: meetgeekId=${meetgeekId}, dbMeetingId=${dbMeetingId}, hasTranscript=${hasTranscriptViaMeetgeek}, isCompleted=${isCompleted}`,
        );

        return {
          id: scheduled.id,
          dealId: scheduled.deal_id,
          dealName: scheduled.meeting_title || 'Scheduled Meeting',
          date: startDate,
          impact: isCompleted ? ('progress' as const) : ('neutral' as const),
          momentum: isCompleted ? 15 : 0,
          keyOutcome: scheduled.meeting_title || 'Scheduled Meeting',
          decisions: [],
          actionItems: [],
          insights: [
            `Status: ${scheduled.status || 'scheduled'}`,
            `Duration: ${duration} minutes`,
            ...(scheduled.meetgeek_meeting_id
              ? [`Meeting ID: ${scheduled.meetgeek_meeting_id}`]
              : []),
            ...(hasTranscriptViaMeetgeek && dbMeetingId
              ? [
                  `📝 Transcript available (${transcriptCounts[dbMeetingId]} segments)`,
                ]
              : []),
          ],
          participants: participants.length > 0 ? participants : ['Unknown'],
          duration: duration,
          transcriptAvailable: hasTranscriptViaMeetgeek, // Check if completed meeting has transcript
          recordingAvailable: false,
          keyInsightSnippet: isCompleted
            ? hasTranscriptViaMeetgeek
              ? `Meeting completed with transcript - click to view details`
              : `Meeting completed - processing transcript`
            : `Scheduled for ${new Date(startDate).toLocaleDateString()}`,
        };
      });

      allMeetings.push(...transformedScheduled);
    }

    // If no meetings data, fall back to calendar events
    if (allMeetings.length === 0) {
      console.log('No meetings found, falling back to calendar events');

      const { data: calendarEvents, error: calendarError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('account_id', accountId)
        .order('start_time', { ascending: false });

      if (calendarEvents && calendarEvents.length > 0) {
        const transformedCalendar = calendarEvents.map((event: any) => {
          const startDate = event.start_time;
          const endDate = event.end_time;
          const duration =
            endDate && startDate
              ? Math.round(
                  (new Date(endDate).getTime() -
                    new Date(startDate).getTime()) /
                    (1000 * 60),
                )
              : 30;

          const attendeeList = Array.isArray(event.attendees)
            ? event.attendees
            : [];
          const participants = attendeeList
            .map((a: any) => a.email || a.displayName || 'Unknown')
            .filter(Boolean);

          return {
            id: event.id,
            dealId: event.calendar_event_id,
            dealName: event.title || 'Calendar Event',
            date: startDate,
            impact: 'neutral' as const,
            momentum: 0,
            keyOutcome: `${event.title || 'Calendar Event'} - ${event.location || 'Location TBD'}`,
            decisions: [],
            actionItems: [],
            insights: [
              `Organizer: ${event.organizer_name || event.organizer_email || 'Unknown'}`,
              `Duration: ${duration} minutes`,
              ...(event.location ? [`Location: ${event.location}`] : []),
              ...(event.meeting_link ? [`Meeting Link Available`] : []),
            ],
            participants:
              participants.length > 0
                ? participants
                : [event.organizer_email || 'Unknown'],
            duration: duration,
            transcriptAvailable: false,
            recordingAvailable: !!event.meeting_link,
            keyInsightSnippet: `Calendar meeting with ${attendeeList.length || 1} participants`,
          };
        });

        allMeetings.push(...transformedCalendar);
      }
    }

    // Deduplicate meetings before sorting
    const deduplicatedMeetings: any[] = [];
    const seenMeetings = new Set<string>();
    
    for (const meeting of allMeetings) {
      // Create a unique key based on date, title, and duration
      // This handles cases where the same meeting appears in multiple tables
      const meetingDate = new Date(meeting.date).toISOString().split('T')[0]; // Date only
      const meetingTitle = (meeting.dealName || '').toLowerCase().trim();
      const uniqueKey = `${meetingDate}_${meetingTitle}_${meeting.duration}`;
      
      // Also check for MeetGeek ID if available (more reliable for actual meetings)
      const meetgeekKey = meeting.insights?.find((insight: string) => 
        insight.includes('Meeting ID:'))?.replace('Meeting ID: ', '');
      
      if (meetgeekKey) {
        const meetgeekUniqueKey = `meetgeek_${meetgeekKey}`;
        if (!seenMeetings.has(meetgeekUniqueKey)) {
          seenMeetings.add(meetgeekUniqueKey);
          seenMeetings.add(uniqueKey); // Also block the generic key
          deduplicatedMeetings.push(meeting);
        }
      } else if (!seenMeetings.has(uniqueKey)) {
        seenMeetings.add(uniqueKey);
        deduplicatedMeetings.push(meeting);
      } else {
        console.log(`🔄 Skipping duplicate meeting: ${meetingTitle} on ${meetingDate}`);
      }
    }

    // Sort by date (most recent first)
    deduplicatedMeetings.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    console.log(`✅ Transformed ${allMeetings.length} meetings, deduplicated to ${deduplicatedMeetings.length} for UI`);
    console.log(
      `📝 Meetings with transcripts: ${deduplicatedMeetings.filter((m) => m.transcriptAvailable).length}`,
    );

    return {
      success: true,
      meetings: deduplicatedMeetings,
    };
  } catch (error) {
    console.error('Error in getMeetings:', error);
    return {
      success: false,
      error: 'Internal server error',
      meetings: [],
    };
  }
}

export async function getAllMeetings(accountId: string) {
  return getMeetings(accountId);
}

export async function getMeetingsByDeal(dealId: string, accountId: string) {
  try {
    const supabase = getSupabaseServerClient();

    // Verify account exists and user has access
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      console.error('Account not found:', accountError);
      return {
        success: false,
        error: 'Account not found or inaccessible',
        meetings: [],
      };
    }

    const { data: calendarEvents, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('account_id', accountId)
      .eq('calendar_event_id', dealId);

    if (error) {
      console.error('Error fetching calendar events for deal:', error);
      return {
        success: false,
        error: 'Failed to fetch calendar events',
        meetings: [],
      };
    }

    // Transform calendar events to match the UI interface
    const transformedMeetings = calendarEvents.map((event: any) => {
      const startDate = event.start_time;
      const endDate = event.end_time;
      const duration =
        endDate && startDate
          ? Math.round(
              (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                (1000 * 60),
            )
          : 30;

      const attendeeList = Array.isArray(event.attendees)
        ? event.attendees
        : [];
      const participants = attendeeList
        .map((a: any) => a.email || a.displayName || 'Unknown')
        .filter(Boolean);

      return {
        id: event.id,
        dealId: event.calendar_event_id,
        dealName: event.title || 'Untitled Meeting',
        date: startDate,
        impact: 'neutral' as const,
        momentum: 0,
        keyOutcome: `${event.title || 'Calendar Event'} - ${event.location || 'Location TBD'}`,
        decisions: [],
        actionItems: [],
        insights: [
          `Organizer: ${event.organizer_name || event.organizer_email || 'Unknown'}`,
          `Duration: ${duration} minutes`,
          ...(event.location ? [`Location: ${event.location}`] : []),
          ...(event.meeting_link ? [`Meeting Link Available`] : []),
        ],
        participants:
          participants.length > 0
            ? participants
            : [event.organizer_email || 'Unknown'],
        duration: duration,
        transcriptAvailable: false,
        recordingAvailable: !!event.meeting_link,
        keyInsightSnippet: `Calendar meeting with ${attendeeList.length || 1} participants`,
      };
    });

    return {
      success: true,
      meetings: transformedMeetings,
    };
  } catch (error) {
    console.error('Error in getMeetingsByDeal:', error);
    return {
      success: false,
      error: 'Internal server error',
      meetings: [],
    };
  }
}
