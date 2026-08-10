import { requireAuth } from "@/services/auth/session";
import { BusinessSubNav } from "@/components/business/business-sub-nav";

export const metadata = {
  title: "Business",
  description: "Business management suite.",
};

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex flex-1 flex-col">
      <BusinessSubNav />
      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
