"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import Link from "next/link";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

export default function SignInPage() {
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
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replace("Firebase: ", "") : "Sign in failed.");
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
    void finishSignIn(() => signInWithEmailAndPassword(auth, email, password));
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
          <h2>Welcome back</h2>
          <p>{isFirebaseConfigured ? "Sign in to continue to your workspace." : "Local demo mode is ready—use any details to continue."}</p>
          <button className="google-button" onClick={googleSignIn} disabled={loading}>
            <span className="google-g">G</span> Continue with Google
          </button>
          <div className="divider"><span>or continue with email</span></div>
          <form onSubmit={submit}>
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
            <label>Password
              <span className="password-field">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={isFirebaseConfigured ? 6 : 1} required />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button signin-submit" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<ArrowRight size={16} /></button>
          </form>
          <p className="signin-footer">New to Orbit? <Link href="/">Open the local demo</Link></p>
        </div>
      </section>
    </main>
  );
}
