export const dynamic = "force-dynamic";

export default async function ChatListPage() {
  // Don't fetch conversations during server render - avoids database issues
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-2xl">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight">AI Chat</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm">
        Start a new conversation with an AI assistant.
      </p>
    </div>
  );
}