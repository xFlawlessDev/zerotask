import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { signIn, signUp } from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { TextField, PasswordField } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

/**
 * The sign-in screen.
 *
 * It is deliberately the only page outside the shell, and it states what the app is
 * rather than decorating itself. Two modes, one form, errors as text next to the
 * field they belong to.
 */
export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setBusy(true);

    try {
      if (mode === "signin") {
        await signIn({ email, password });
      } else {
        if (name.trim().length < 2) {
          setFieldError("Tell us your name so colleagues can find you.");
          setBusy(false);
          return;
        }
        await signUp({ email, password, name });
      }

      // The session query was created while signed out, so it is disabled and nothing
      // would fetch the signed-in person. Fetch it here and write it into the cache.
      const session = await queryClient.fetchQuery({
        queryKey: ["session"],
        queryFn: () => api.session.get(),
        staleTime: 0,
      });
      queryClient.setQueryData(["session"], session);
      toast.success(mode === "signin" ? "Signed in" : "Welcome to Zero Task");
      void navigate({ to: "/" });
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="size-8 shrink-0 rounded-control object-contain"
          />
          <div>
            <p className="text-section font-semibold tracking-tight text-ink">Zero Task</p>
            <p className="text-meta text-ink-muted">Project delivery, scheduled and reviewed.</p>
          </div>
        </div>

        <div className="rounded-panel border border-rule bg-surface">
          <div className="border-b border-rule px-4 py-3" role="tablist" aria-label="Sign in or create an account">
            <div className="flex gap-4">
              {(["signin", "signup"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => {
                    setMode(value);
                    setFieldError(null);
                  }}
                  className={cn(
                    "-mb-3 border-b-2 pb-3 text-compact font-medium transition-colors",
                    mode === value
                      ? "border-accent-ink text-ink"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {value === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 px-4 py-4" noValidate>
            {mode === "signup" && (
              <TextField
                label="Full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                error={fieldError && name.trim().length < 2 ? fieldError : null}
              />
            )}

            <TextField
              label="Work email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              error={null}
            />

            <PasswordField
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              hint={mode === "signup" ? "At least 10 characters." : undefined}
              error={fieldError && (mode === "signin" || name.trim().length >= 2) ? fieldError : null}
            />

            <Button type="submit" variant="primary" disabled={busy} className="mt-1 justify-center">
              {busy ? "One moment" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-meta text-ink-muted">
          Accounts are created by you or an admin. Ask your manager which projects you should see.
        </p>
      </div>
    </div>
  );
}
