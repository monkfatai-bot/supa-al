import { AuthLayout } from "@/components/auth/auth-layout";
import { FormMessage } from "@/components/auth/form-message";
import { ROUTES } from "@/config/constants";
import Link from "next/link";

export function VerifyEmailCard() {
  return (
    <AuthLayout
      title="Verify your email"
      description="Check your inbox for a verification link"
      footer={
        <p>
          Already verified?{" "}
          <Link
            href={ROUTES.LOGIN}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      }
    >
      <FormMessage
        type="success"
        message="A verification link has been sent to your email. Please click it to activate your account."
      />
    </AuthLayout>
  );
}
