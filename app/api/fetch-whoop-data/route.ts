import { NextRequest, NextResponse } from 'next/server';
import { scheduledWhoopDataFetch } from '@/lib/whoop';
import { supabase } from '@/lib/supabase'; // Needed to potentially check users if not done in scheduledWhoopDataFetch

const CRON_SECRET_INTERNAL = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Protection for the cron job endpoint
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET_INTERNAL || authHeader !== `Bearer ${CRON_SECRET_INTERNAL}`) {
    console.warn('Unauthorized attempt to access fetch-whoop-data route.');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!supabase) {
    console.error("Supabase client not initialized in fetch-whoop-data route");
    return NextResponse.json({ message: "Server configuration error" }, { status: 500 });
  }

  try {
    console.log('Cron job triggered: Starting scheduled WHOOP data fetch...');
    await scheduledWhoopDataFetch(); // This function now handles fetching for all users
    console.log('Cron job finished: WHOOP data fetch process completed.');
    return NextResponse.json({ message: 'WHOOP data fetch process completed.' });
  } catch (error: any) {
    console.error('Error in scheduled WHOOP data fetch route:', error.message);
    return NextResponse.json({ message: 'Error fetching WHOOP data', error: error.message }, { status: 500 });
  }
} 