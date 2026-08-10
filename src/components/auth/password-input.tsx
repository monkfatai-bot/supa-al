"use client";

import * as React from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordInputProps extends React.ComponentProps<typeof Input> {
  showStrength?: boolean;
}

interface Rule {
  label: string;
  met: boolean;
}

function getPasswordRules(password: string): Rule[] {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function getStrength(rules: Rule[]): { level: number; label: string; color: string } {
  const met = rules.filter((r) => r.met).length;
  if (met <= 2) return { level: 1, label: "Weak", color: "bg-red-500" };
  if (met <= 3) return { level: 2, label: "Fair", color: "bg-orange-500" };
  if (met <= 4) return { level: 3, label: "Good", color: "bg-yellow-500" };
  return { level: 4, label: "Strong", color: "bg-green-500" };
}

export function PasswordInput({ className, showStrength, value, ...props }: PasswordInputProps) {
  const [show, setShow] = React.useState(false);

  const passwordValue = typeof value === "string" ? value : "";
  const rules = showStrength ? getPasswordRules(passwordValue) : [];
  const strength = showStrength && passwordValue.length > 0 ? getStrength(rules) : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          className={className}
          autoComplete={show ? "off" : "current-password"}
          value={value}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShow(!show)}
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {showStrength && passwordValue.length > 0 && (
        <div className="space-y-2">
          {/* Strength bar */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    strength && i <= strength.level ? strength.color : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground w-12 text-right">
              {strength?.label}
            </span>
          </div>

          {/* Rule checklist */}
          <ul className="space-y-1">
            {rules.map((rule) => (
              <li key={rule.label} className="flex items-center gap-2 text-xs">
                {rule.met ? (
                  <Check className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className={rule.met ? "text-muted-foreground" : "text-muted-foreground"}>
                  {rule.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
