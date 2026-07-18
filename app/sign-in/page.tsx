"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from "firebase/auth";
import Link from "next/link";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

export default function SignInPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [currentAccount, setCurrentAccount] = useState("");
  const [message, setMessage] = useState("");
  const [invitationSignup, setInvitationSignup] = useState(false);

  useEffect(() => {
    const isSwitching = new URLSearchParams(window.location.search).get("switch") === "1";
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("next") ?? "";
    setInvitationSignup(requested.startsWith("/invite?"));
    if (params.get("deleted") === "account") setMessage("Your Orbit account and personal data were deleted.");
    if (params.get("deleted") === "workspace") setMessage("The workspace was permanently deleted. Your login remains available for future invitations.");
    setSwitching(isSwitching);
    if (!isSwitching) return;
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => setCurrentAccount(user ? user.email ?? user.displayName ?? "your current account" : ""));
  }, []);

  async function finishSignIn(action: () => Promise<unknown>, options: { redirect?: boolean; successMessage?: string } = {}) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (options.redirect === false) {
        if (options.successMessage) setMessage(options.successMessage);
        return;
      }
      const requested = new URLSearchParams(window.location.search).get("next");
      window.location.href = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";
    } catch (caught) {
      const code = typeof caught === "object" && caught && "code" in caught ? String(caught.code) : "";
      if (code === "auth/email-already-in-use") setError("An account already exists for this email. Choose Sign in instead.");
      else if (code === "auth/invalid-credential") setError("That email or password is incorrect.");
      else if (code === "auth/weak-password") setError("Use a password with at least 8 characters.");
      else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") setError("Account switching was cancelled. Your current account is still signed in.");
      else if ((caught instanceof Error ? caught.message : "").toLowerCase().includes("invite")) setError("Orbit is invite-only. Use the email address and link from a valid workspace invitation.");
      else setError(caught instanceof Error ? caught.message.replace("Firebase: ", "") : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const auth = getFirebaseAuth();
    if (!auth) {
      window.location.href = "/";
      return;
    }
    if (mode === "reset") {
      setLoading(true);
      setError("");
      setMessage("");
      void sendPasswordResetEmail(auth, email.trim()).then(() => {
        setMessage("Password reset email sent. Check your inbox and spam folder.");
      }).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message.replace("Firebase: ", "") : "The reset email could not be sent.");
      }).finally(() => setLoading(false));
      return;
    }
    if (mode === "signup") {
      void finishSignIn(async () => {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        const requested = new URLSearchParams(window.location.search).get("next") ?? "/";
        const continueUrl = new URL("/sign-in", window.location.origin);
        if (requested.startsWith("/") && !requested.startsWith("//")) continueUrl.searchParams.set("next", requested);
        await sendEmailVerification(credential.user, { url: continueUrl.toString() });
        await signOut(auth);
        setMode("signin");
        setPassword("");
      }, { redirect: false, successMessage: "Verification email sent. Verify the address, then return to this invitation and sign in." });
      return;
    }
    void finishSignIn(() => signInWithEmailAndPassword(auth, email.trim(), password));
  }

  function googleSignIn() {
    const auth = getFirebaseAuth();
    if (!auth) {
      window.location.href = "/";
      return;
    }
    const provider = new GoogleAuthProvider();
    if (switching) provider.setCustomParameters({ prompt: "select_account" });
    void finishSignIn(() => signInWithPopup(auth, provider));
  }

  return (
    <main className="signin-page">
      <section className="signin-story">
        <Link className="brand brand-light" href="/">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>orbit</span>
        </Link>
        <div className="story-copy">
          <p className="eyebrow">A calmer way to get work done</p>
          <h1>Give every project a clear path forward.</h1>
          <p>Plans, people, progress, and the next important step—together in one focused workspace.</p>
          <div className="benefit-list">
            <span><Check size={16} /> Visualize work your way</span>
            <span><Check size={16} /> Keep every owner and deadline clear</span>
            <span><Check size={16} /> Turn updates into steady momentum</span>
          </div>
        </div>
        <p className="story-quote">“The right amount of structure, without the weight.”</p>
      </section>

      <section className="signin-panel">
        <div className="signin-card">
          <div className="mobile-signin-brand">
            <span className="brand-mark"><Sparkles size={17} /></span> orbit
          </div>
          <h2>{switching ? "Switch account" : mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}</h2>
          <p>{switching ? `Choose the account you want to use${currentAccount ? `. You are currently signed in as ${currentAccount}.` : "."}` : mode === "reset" ? "We’ll email you a secure password-reset link." : isFirebaseConfigured ? (mode === "signin" ? "Sign in to continue to your workspace." : "Use the email address that received your Orbit invitation.") : "Local demo mode is ready—use any details to continue."}</p>
          {mode !== "reset" && <>
          <button className="google-button" onClick={googleSignIn} disabled={loading}>
            <span className="google-g">G</span> {switching ? "Choose a Google account" : "Continue with Google"}
          </button>
          <div className="divider"><span>or continue with email</span></div>
          </>}
          <form onSubmit={submit}>
            {mode === "signup" && <label>Full name<input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required /></label>}
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
            {mode !== "reset" && <label>Password
              <span className="password-field">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} minLength={isFirebaseConfigured ? (mode === "signup" ? 8 : 6) : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>}
            {mode === "signin" && <button type="button" className="forgot-password" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>}
            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}
            <button className="primary-button signin-submit" type="submit" disabled={loading}>{loading ? (mode === "signin" ? "Signing in…" : mode === "signup" ? "Creating account…" : "Sending…") : (mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email")}<ArrowRight size={16} /></button>
          </form>
          {switching ? <p className="signin-footer"><Link href="/">Cancel and keep current account</Link></p> : invitationSignup || mode !== "signin" ? <p className="signin-footer">{mode === "signin" ? "Using an invitation?" : mode === "signup" ? "Already have an account?" : "Remember your password?"} <button type="button" onClick={() => { setMode((value) => value === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>{mode === "signin" ? "Create your invited account" : "Sign in"}</button></p> : <p className="signin-footer">Need access? Ask a workspace owner to send an invitation.</p>}
          <nav className="signin-legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></nav>
        </div>
      </section>
    </main>
  );
}
