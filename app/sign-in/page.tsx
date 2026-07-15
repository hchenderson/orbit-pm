"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import Link from "next/link";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

export default function SignInPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function finishSignIn(action: () => Promise<unknown>) {
    setLoading(true);
    setError("");
    try {
      await action();
      const requested = new URLSearchParams(window.location.search).get("next");
      window.location.href = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";
    } catch (caught) {
      const code = typeof caught === "object" && caught && "code" in caught ? String(caught.code) : "";
      if (code === "auth/email-already-in-use") setError("An account already exists for this email. Choose Sign in instead.");
      else if (code === "auth/invalid-credential") setError("That email or password is incorrect.");
      else if (code === "auth/weak-password") setError("Use a password with at least 8 characters.");
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
    if (mode === "signup") {
      void finishSignIn(async () => {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
      });
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
    void finishSignIn(() => signInWithPopup(auth, new GoogleAuthProvider()));
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
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p>{isFirebaseConfigured ? (mode === "signin" ? "Sign in to continue to your workspace." : "Use the email address that received your Orbit invitation.") : "Local demo mode is ready—use any details to continue."}</p>
          <button className="google-button" onClick={googleSignIn} disabled={loading}>
            <span className="google-g">G</span> Continue with Google
          </button>
          <div className="divider"><span>or continue with email</span></div>
          <form onSubmit={submit}>
            {mode === "signup" && <label>Full name<input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required /></label>}
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
            <label>Password
              <span className="password-field">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} minLength={isFirebaseConfigured ? (mode === "signup" ? 8 : 6) : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button signin-submit" type="submit" disabled={loading}>{loading ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Create account")}<ArrowRight size={16} /></button>
          </form>
          <p className="signin-footer">{mode === "signin" ? "New to Orbit?" : "Already have an account?"} <button type="button" onClick={() => { setMode((value) => value === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
          <nav className="signin-legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></nav>
        </div>
      </section>
    </main>
  );
}
