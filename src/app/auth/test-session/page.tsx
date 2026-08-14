import { getAuthUser, getAuthenticatedUser } from "@/services/auth/session";

export default async function TestSessionPage() {
  const authUser = await getAuthUser();
  const profile = await getAuthenticatedUser();

  return (
    <div className="p-8 space-y-4 bg-slate-950 text-white min-h-screen">
      <h1 className="text-3xl font-bold">Session Test</h1>

      <div className="border border-blue-500 p-4 rounded">
        <h2 className="font-bold text-blue-400">Auth User (Supabase):</h2>
        {authUser ? (
          <pre className="bg-slate-900 p-2 rounded text-sm overflow-auto mt-2">
            {JSON.stringify(
              {
                id: authUser.id,
                email: authUser.email,
                confirmed_at: authUser.confirmed_at,
              },
              null,
              2
            )}
          </pre>
        ) : (
          <p className="text-red-400 mt-2">❌ NO AUTH USER - Cookies not set!</p>
        )}
      </div>

      <div className="border border-green-500 p-4 rounded">
        <h2 className="font-bold text-green-400">Profile (Database):</h2>
        {profile ? (
          <pre className="bg-slate-900 p-2 rounded text-sm overflow-auto mt-2">
            {JSON.stringify(profile, null, 2)}
          </pre>
        ) : (
          <p className="text-red-400 mt-2">❌ NO PROFILE</p>
        )}
      </div>

      <div className="border border-yellow-500 p-4 rounded">
        <h2 className="font-bold text-yellow-400">Status:</h2>
        {authUser && profile ? (
          <p className="text-green-400 mt-2">✅ Session is WORKING! Chat should load.</p>
        ) : (
          <p className="text-red-400 mt-2">❌ Session is BROKEN - cookies still not persisting</p>
        )}
      </div>
    </div>
  );
}
