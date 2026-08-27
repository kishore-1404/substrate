"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 2 && password.length > 0 && (mode === "login" || name.trim().length > 0);

  async function submit() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        return;
      }
      router.push(mode === "signup" ? "/onboarding" : "/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-5 sm:p-10">
      <div className="flex w-full max-w-[420px] flex-col gap-7">
        <div className="flex items-center justify-center gap-2.5">
          <div className="h-[9px] w-[9px] rounded-[2px] bg-primary" />
          <span className="font-mono text-sm font-semibold tracking-wide text-muted-foreground">SUBSTRATE</span>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8">
          <div className="flex rounded-[9px] border p-[3px]">
            {(["signup", "login"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-[7px] py-2.5 text-center text-[13px] font-semibold transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "signup" ? "Sign up" : "Log in"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <Field label="Name" value={name} onChange={setName} placeholder="Jordan Lee" />
          )}
          <Field label="Work email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" />
          <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="h-auto justify-center rounded-lg py-3 text-sm font-semibold"
            style={{ opacity: canSubmit ? 1 : 0.5 }}
            disabled={!canSubmit || loading}
            onClick={submit}
          >
            {loading ? "…" : mode === "signup" ? "Create account" : "Log in"}
          </Button>

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Each teammate gets their own account, their own pace, and their own mastery record.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
      />
    </div>
  );
}
