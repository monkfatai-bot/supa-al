import { getAuthUser, getAuthenticatedUser } from "@/services/auth/session";

export default async function SessionTestPage() {
  const authUser = await getAuthUser();
  const profile = await getAuthenticatedUser();

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Session Debug</h1>
      
      <div className="bg-blue-100 p-4 rounded">
        <h2 className="font-bold">Auth User (from Supabase Auth):</h2>
        {authUser ? (
          <pre className="bg-white p-2 rounded text-sm overflow-auto">
            {JSON.stringify(authUser, null, 2)}
          </pre>
        ) : (
          <p className="text-red-600">❌ NO AUTH USER - Session not set!</p>
        )}
      </div>

      <div className="bg-green-100 p-4 rounded">
        <h2 className="font-bold">Profile (from Database):</h2>
        {profile ? (
          <pre className="bg-white p-2 rounded text-sm overflow-auto">
            {JSON.stringify(profile, null, 2)}
          </pre>
        ) : (
          <p className="text-red-600">❌ NO PROFILE</p>
        )}
      </div>

      <div className="bg-yellow-100 p-4 rounded">
        <h2 className="font-bold">Status:</h2>
        {authUser && profile ? (
          <p className="text-green-600">✅ Authenticated and ready for chat!</p>
        ) : (
          <p className="text-red-600">❌ Session not persisting - cookies not set</p>
        )}
      </div>
    </div>
  );
}
