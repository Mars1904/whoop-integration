'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = () => {
    router.push('/api/auth');
  };

  useEffect(() => {
    const error = searchParams.get('error');
    const reason = searchParams.get('reason');
    if (error) {
      alert(`Login failed: ${error}${reason ? ` (Reason: ${reason})` : ''}`);
      // Optionally clear the error from the URL
      // router.replace('/', { scroll: false }); // Updated for App Router, if needed
    }
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">WHOOP Insights</h1>
        <p className="text-xl text-gray-400 mb-8">
          Verbinde deinen WHOOP Account, um deine Performance-Daten zu visualisieren.
        </p>
        <button
          onClick={handleLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-lg shadow-md transition duration-150 ease-in-out transform hover:scale-105"
        >
          Mit WHOOP anmelden
        </button>
      </div>
      <footer className="absolute bottom-8 text-gray-500">
        <p>&copy; {new Date().getFullYear()} Spandau Whoop</p>
      </footer>
    </div>
  );
}
 