import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { createAuthCallbackService } from '@kit/supabase/auth';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import pathsConfig from '~/config/paths.config';

export async function GET(request: NextRequest) {
  console.log('🔄 Auth callback starting:', {
    url: request.url,
    searchParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
    headers: Object.fromEntries(request.headers.entries()),
  });

  const service = createAuthCallbackService(getSupabaseServerClient());

  const { nextPath } = await service.exchangeCodeForSession(request, {
    joinTeamPath: pathsConfig.app.joinTeam,
    redirectPath: pathsConfig.app.home,
  });

  // Check if this might be a first login by looking for recent account creation
  const supabase = getSupabaseServerClient();
  let isFirstLogin = false;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Check if the user was created recently (within last 5 minutes)
      const userCreatedAt = new Date(user.created_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      isFirstLogin = userCreatedAt > fiveMinutesAgo;
      
      console.log('🔍 First login check:', {
        userCreatedAt: userCreatedAt.toISOString(),
        fiveMinutesAgo: fiveMinutesAgo.toISOString(),
        isFirstLogin,
        userId: user.id,
      });
    }
  } catch (error) {
    console.error('Error checking first login status:', error);
  }

  // Use absolute URL for redirect to avoid browser interpretation issues
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const finalUrl = new URL(nextPath, siteUrl);
  
  // Add first_login parameter if this is a new user
  if (isFirstLogin) {
    finalUrl.searchParams.set('first_login', 'true');
    console.log('✨ Adding first_login parameter for new user');
  }
  
  const absoluteUrl = finalUrl.toString();
  
  console.log('🔄 Auth callback redirect:', { 
    nextPath, 
    siteUrl, 
    absoluteUrl,
    isFirstLogin,
    joinTeamPath: pathsConfig.app.joinTeam,
    redirectPath: pathsConfig.app.home,
    env_site_url: process.env.NEXT_PUBLIC_SITE_URL
  });
  
  return redirect(absoluteUrl);
}
