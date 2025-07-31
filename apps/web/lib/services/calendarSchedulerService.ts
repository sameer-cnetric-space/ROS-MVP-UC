import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

export interface CalendarEventDetails {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: { email: string; displayName?: string }[];
  dealId: string;
  user: any;
  gmailAccount: { access_token: string; refresh_token: string };
  timeZone?: string;
}

export class CalendarSchedulerService {
  private oauth2Client: OAuth2Client;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  async scheduleEvent(details: CalendarEventDetails) {
    this.oauth2Client.setCredentials({
      access_token: details.gmailAccount.access_token,
      refresh_token: details.gmailAccount.refresh_token,
    });
    const calendar = google.calendar({
      version: 'v3',
      auth: this.oauth2Client,
    } as any);

    const userTimeZone = details.timeZone || 'UTC';
    console.log('📅 Creating calendar event with timezone:', userTimeZone);

    let startDateTime = details.startTime;
    let endDateTime = details.endTime;
    
    console.log('📅 Received datetime strings:', { startDateTime, endDateTime, userTimeZone });
    
    // Check if we have RFC3339 datetime strings (with timezone offset)
    const hasTimezoneOffset = startDateTime && (startDateTime.includes('+') || startDateTime.includes('-') || startDateTime.includes('Z'));
    
    let eventStart, eventEnd;
    
    if (hasTimezoneOffset) {
      // RFC3339 datetime with timezone - use directly without timezone property
      console.log('📅 Using RFC3339 datetime strings with timezone offset');
      eventStart = { dateTime: startDateTime };
      eventEnd = { dateTime: endDateTime };
    } else {
      // Local datetime without timezone - use with timezone property
      console.log('📅 Using local datetime with timezone property');
      eventStart = { dateTime: startDateTime, timeZone: userTimeZone };
      eventEnd = { dateTime: endDateTime, timeZone: userTimeZone };
    }

    const eventDetails = {
      summary: details.title,
      description: details.description,
      start: eventStart,
      end: eventEnd,
      location: details.location,
      attendees: details.attendees,
      conferenceData: {
        createRequest: {
          requestId: `${details.dealId}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    // Log event details and attendees before sending
    console.log(
      '📅 Preparing to create Google Calendar event with details:',
      JSON.stringify(eventDetails, null, 2),
    );
    
    console.log('📅 Event start/end details for debugging:', {
      startDateTime: eventDetails.start?.dateTime,
      startTimeZone: eventDetails.start?.timeZone,
      endDateTime: eventDetails.end?.dateTime,
      endTimeZone: eventDetails.end?.timeZone,
      hasTimezoneOffset,
      originalStartTime: details.startTime,
      originalEndTime: details.endTime,
    });
    if (
      !Array.isArray(eventDetails.attendees) ||
      eventDetails.attendees.length === 0
    ) {
      console.warn('⚠️ No attendees specified for this event!');
    } else {
      console.log(
        '📧 Attendees:',
        eventDetails.attendees.map((a) => a.email).join(', '),
      );
    }

    // Create the calendar event
    let response;
    try {
      response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventDetails,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });
      console.log(
        '✅ Google Calendar API response:',
        JSON.stringify(response.data, null, 2),
      );
      return response.data;
    } catch (googleError) {
      console.error('❌ Error from Google Calendar API:', googleError);
      throw googleError;
    }
  }
}
