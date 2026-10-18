import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

/** Seconds a user must wait before asking for a fresh code. */
const RESEND_COOLDOWN_S = 30;
/** Matches `maxAge` on the email-otp provider (src/convex/auth/emailOtp.ts). */
const CODE_TTL_MINUTES = 15;

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/**
 * Pull a human-readable sentence out of whatever Convex throws.
 *
 * Server errors arrive as noisy strings like
 * `[CONVEX A(auth:signIn)] [Request ID: …] Uncaught Error: …\n    at handler …`
 * — and in production plain errors are redacted to `Server Error` entirely,
 * unless they were thrown as `ConvexError` (which is why the backend throws
 * those for send failures). Anything we can't read falls back to `fallback`.
 */
function readAuthError(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null | undefined)?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (!(error instanceof Error)) return fallback;

  // Keep the first line(s) before the stack trace starts.
  const head: string[] = [];
  for (const line of error.message.split("\n")) {
    if (/^\s+at\s/.test(line)) break;
    head.push(line);
  }
  const cleaned = head
    .join(" ")
    .replace(/\[CONVEX[^\]]*\]/g, " ")
    .replace(/\[Request ID:[^\]]*\]/g, " ")
    .replace(/\b(?:Uncaught\s+)?Error:\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^server error$/i.test(cleaned)) return fallback;
  return cleaned;
}

/** Email addresses are treated case-insensitively — normalize before auth. */
function normalizeEmail(value: FormDataEntryValue | string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [emailDraft, setEmailDraft] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Re-entry guards: React state updates are async, so a fast double-click or
  // Enter + auto-submit must be stopped with a ref, not with `isLoading`.
  const busyRef = useRef(false);
  const failedAttemptsRef = useRef(0);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(
      () => setResendIn((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendIn]);

  /** Ask the backend to email a fresh 6-digit code. Returns success. */
  const sendCode = async (email: string): Promise<boolean> => {
    if (busyRef.current || !email) return false;
    busyRef.current = true;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      await signIn("email-otp", { email });
      setNotice(
        `Code sent to ${email} — it expires in ${CODE_TTL_MINUTES} minutes.`,
      );
      setResendIn(RESEND_COOLDOWN_S);
      setOtp("");
      return true;
    } catch (err) {
      console.error("Failed to send sign-in code:", err);
      setError(
        readAuthError(
          err,
          "We couldn't send your code. Please check the address and try again.",
        ),
      );
      return false;
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = normalizeEmail(emailDraft);
    if (!email) return;
    const sent = await sendCode(email);
    if (sent) {
      setEmailDraft(email);
      setStep({ email });
    }
  };

  const resendCode = async () => {
    if (typeof step === "string" || resendIn > 0) return;
    await sendCode(step.email);
  };

  const verifyCode = async (code: string) => {
    if (typeof step === "string" || code.length !== 6 || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      await signIn("email-otp", { email: step.email, code });
      // Tokens are set — navigate directly; the auth effect above is the fallback.
      navigate(redirect);
    } catch (err) {
      console.error("Code verification failed:", err);
      busyRef.current = false;
      setIsLoading(false);
      failedAttemptsRef.current += 1;
      setOtp("");
      const detail = readAuthError(err, "");
      if (/network|connection|fetch|reach/i.test(detail)) {
        setError(
          "Couldn't reach the server. Check your connection and try again.",
        );
      } else if (failedAttemptsRef.current >= 2) {
        setError(
          `That code didn't work. Codes expire after ${CODE_TTL_MINUTES} minutes — send a new one, wait a moment, then try the newest email.`,
        );
      } else {
        setError(
          "That code didn't match or has expired. Check the latest email for the newest code.",
        );
      }
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await verifyCode(otp);
  };

  const changeEmail = () => {
    setStep("signIn");
    setOtp("");
    setError(null);
    setNotice(null);
  };

  const handleGuestLogin = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (err) {
      console.error("Guest sign-in failed:", err);
      busyRef.current = false;
      setIsLoading(false);
      setError(
        readAuthError(err, "Couldn't continue as guest. Please try again."),
      );
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Auth Content */}
      <div className="flex w-full flex-1 items-center justify-center p-4">
        <div className="flex items-center justify-center h-full flex-col">
          <Card className="w-full max-w-sm pb-0 border shadow-md">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <div className="flex justify-center">
                    <img
                      src={logo}
                      alt="Lock Icon"
                      width={64}
                      height={64}
                      className="rounded-lg mb-4 mt-4 cursor-pointer"
                      onClick={() => navigate("/")}
                    />
                  </div>
                  <CardTitle className="text-xl">Get Started</CardTitle>
                  <CardDescription>
                    Enter your email to log in or sign up
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          name="email"
                          placeholder="name@example.com"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          autoFocus
                          className="pl-9"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          disabled={isLoading}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                        aria-label="Send sign-in code"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm text-red-500">{error}</p>
                    )}

                    <div className="mt-4">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            Or
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-4"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Continue as Guest
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="text-center mt-4">
                  <CardTitle>Check your email</CardTitle>
                  <CardDescription>
                    We sent a {6}-digit code to{" "}
                    <span className="font-medium text-foreground">
                      {step.email}
                    </span>
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent className="pb-4">
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={(value) => {
                          setOtp(value);
                          if (error) setError(null);
                        }}
                        onComplete={(value) => void verifyCode(value)}
                        maxLength={6}
                        autoFocus
                        disabled={isLoading}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error ? (
                      <p className="mt-3 text-center text-sm text-red-500">
                        {error}
                      </p>
                    ) : (
                      <p className="mt-3 text-center text-xs text-muted-foreground">
                        {notice ??
                          `Codes expire after ${CODE_TTL_MINUTES} minutes.`}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground text-center mt-4">
                      Didn't receive it?{" "}
                      <Button
                        type="button"
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => void resendCode()}
                        disabled={resendIn > 0 || isLoading}
                      >
                        {resendIn > 0
                          ? `Send a new code in ${resendIn}s`
                          : "Send a new code"}
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify code
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={changeEmail}
                      disabled={isLoading}
                      className="w-full"
                    >
                      Use a different email
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

            <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
              Secured by{" "}
              <a
                href="https://freebuff.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary transition-colors"
              >
                freebuff.com
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
