import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuthSubmitButtonProps {
  pending: boolean;
  children: React.ReactNode;
}

export function AuthSubmitButton({ pending, children }: AuthSubmitButtonProps) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Please wait…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
