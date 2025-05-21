import React from 'react';
import { supabase } from '@/lib/supabase';
import { getWhoopUserIdFromCookie, TransformedWhoopData, fetchAndStoreWhoopData } from '@/lib/whoop';
import { cookies } from 'next/headers'; // For server-side cookie access
import { NextRequest } from 'next/server'; // Mock NextRequest
import Link from 'next/link';
import { redirect } from 'next/navigation';

async function getWhoopDataForUser(whoopUserId: string): Promise<TransformedWhoopData[]> {
  if (!supabase) {
    console.error("Supabase client not initialized in getWhoopDataForUser");
    return [];
  }
  const { data, error } = await supabase
    .from('whoop_data')
    .select('sleep_duration, recovery_score, strain_score, heart_rate, timestamp')
    .eq('whoop_user_id', whoopUserId)
    .order('timestamp', { ascending: false })
    .limit(30); // Get last 30 entries for display

  if (error) {
    console.error('Error fetching WHOOP data from Supabase:', error.message);
    return [];
  }
  return data || [];
}

// Mock NextRequest for getWhoopUserIdFromCookie as it expects a NextRequest object
function createMockRequest(): NextRequest {
    const dummyUrl = 'http://localhost:3000/profile'; // URL doesn't matter much here
    const req = new NextRequest(dummyUrl, {
        headers: { cookie: cookies().toString() }
    });
    return req;
}

export default async function ProfilePage() {
  const mockRequest = createMockRequest();
  const whoopUserId = await getWhoopUserIdFromCookie(mockRequest);

  if (!whoopUserId) {
    // If no user ID, redirect to login. Add a query param for context if desired.
    redirect('/?error=not_logged_in');
    // return null; // Or render a message, redirect handles this
  }

  // Attempt to fetch fresh data upon profile view for this user.
  // This provides a more immediate update if the cron job hasn't run recently.
  // You might want to add a check to avoid fetching too frequently.
  const fetchedFreshData = await fetchAndStoreWhoopData(whoopUserId);
  if (fetchedFreshData) {
    console.log('Fresh WHOOP data fetched successfully on profile load for:', whoopUserId);
  }

  const whoopData = await getWhoopDataForUser(whoopUserId);

  const handleLogout = async () => {
    'use server';
    // Clear the server-side cookie
    cookies().delete('whoop_user_id');
    // In a real app, you might also want to invalidate the token on WHOOP's side if possible,
    // or at least remove it from your database to force a new login.
    // For now, just deleting the cookie will require re-login.
    redirect('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-blue-400">Dein WHOOP Profil</h1>
        <form action={handleLogout}>
            <button 
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-150 ease-in-out">
                Abmelden
            </button>
        </form>
      </header>

      {whoopData.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-xl text-gray-400 mb-4">
            {fetchedFreshData ? 'Aktuelle Daten werden geladen oder es sind noch keine Daten vorhanden.' : 'Keine WHOOP-Daten gefunden. Synchronisiere deine WHOOP-App oder warte auf die nächste automatische Aktualisierung.'}
          </p>
          <p className="text-gray-500">UserID: {whoopUserId}</p>
          <Link href="/" className="mt-6 inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg">
            Zurück zur Startseite
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {whoopData.map((entry, index) => (
            <div key={index} className="bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-blue-500/30 transition-shadow duration-300">
              <h2 className="text-sm font-semibold text-blue-400 mb-3">
                {new Date(entry.timestamp).toLocaleDateString('de-DE', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </h2>
              <div className="space-y-2 text-gray-300">
                <p><strong>Schlafdauer:</strong> {entry.sleep_duration?.toFixed(1) ?? 'N/A'} Stunden</p>
                <p><strong>Erholung:</strong> {entry.recovery_score ?? 'N/A'}%</p>
                <p><strong>Belastung:</strong> {entry.strain_score?.toFixed(1) ?? 'N/A'}</p>
                <p><strong>Puls (Ruhe):</strong> {entry.heart_rate ?? 'N/A'} bpm</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="text-center text-gray-500 mt-12 py-6 border-t border-gray-700">
        <p>&copy; {new Date().getFullYear()} Spandau Whoop. Alle Rechte vorbehalten.</p>
        <p className="text-xs mt-1">Daten bereitgestellt von WHOOP.</p>
      </footer>
    </div>
  );
} 