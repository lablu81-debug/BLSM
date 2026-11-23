import React, { useState } from 'react';
import { Eye, EyeOff, Sun, Moon, ShieldCheck, BellRing, BarChart3, FileSpreadsheet, History, Users, Lock, ArrowRight } from 'lucide-react';
import { UserAccount } from '../types';
import { login, ApiError } from '../utils/storage';

interface LoginScreenProps {
  companies: string[];
  onSignInSuccess: (user: UserAccount) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  companies,
  onSignInSuccess,
  isDarkMode,
  onToggleTheme
}) => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const id = loginId.trim();

    if (!id || !password) {
      setErrorMsg('Please enter both User ID and Password.');
      return;
    }

    setLoading(true);
    try {
      const { user } = await login(id, password);
      onSignInSuccess(user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, title: 'Traffic-light compliance', text: 'Green, amber and red status for every license, by unit and type, updated in real time.' },
    { icon: BellRing, title: 'Automated renewal alerts', text: 'Staged reminders before expiry so no license ever lapses unnoticed.' },
    { icon: Users, title: 'Role-based access', text: 'Administrator, Verifier, Operator and Viewer roles with per-unit scope.' },
    { icon: FileSpreadsheet, title: 'Import and reports', text: 'Bulk Excel/CSV import, printable reports and one-click PDF/Excel export.' },
    { icon: History, title: 'Immutable audit trail', text: 'Append-only activity and notification logs for every regulatory review.' },
    { icon: ShieldCheck, title: 'Enterprise security', text: 'Hashed passwords, signed sessions, CSRF protection and login throttling.' }
  ];
  const stats = [
    { v: String(companies.length || 5), l: 'Factory units' },
    { v: '4', l: 'Access roles' },
    { v: '24/7', l: 'Expiry monitoring' },
    { v: '100%', l: 'Audit logged' }
  ];

  const inputCls = 'w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] text-[var(--color-text-primary)] focus:outline-hidden focus:border-[var(--brand-text)] focus:ring-2 focus:ring-[var(--brand-light)]';

  return (
    <div className="min-h-screen bg-[var(--color-background-secondary)] text-[var(--color-text-primary)]">
      {/* Navy hero */}
      <header className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg,#0B1F3A 0%,#1B365D 55%,#27508A 100%)' }}>
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%,#6C9BD8 0,transparent 40%),radial-gradient(circle at 85% 70%,#3A6BB0 0,transparent 45%)' }} />
        <nav className="relative max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight">Acme <span className="font-normal opacity-80">Group</span> <span className="ml-2 text-[10px] font-semibold tracking-widest px-2 py-0.5 rounded bg-white/15 align-middle">BLMS</span></div>
          <button onClick={onToggleTheme} className="p-2 rounded-full border border-white/25 bg-white/10 hover:bg-white/20 cursor-pointer" title="Toggle Theme">
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
          </button>
        </nav>

        <div className="relative max-w-6xl mx-auto px-6 pt-8 pb-16 lg:pb-24 grid lg:grid-cols-5 gap-10 items-center">
          <div className="lg:col-span-3 space-y-6">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider px-3 py-1 rounded-full bg-white/10 border border-white/20">
              <Lock className="w-3.5 h-3.5" /> ON-TIME LICENSE RENEWAL PLATFORM
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">
              Never miss a license renewal again.
            </h1>
            <p className="text-base md:text-lg text-white/80 leading-relaxed max-w-xl">
              BLMS centralizes every business license, certificate and permit across your factory units, with live compliance status, automated reminders and a full audit trail.
            </p>
            <div className="flex flex-wrap gap-2">
              {companies.map(c => (
                <span key={c} className="px-2.5 py-1 text-[11px] font-semibold border border-white/30 rounded-md tracking-wider bg-white/5">{c}</span>
              ))}
            </div>
            <a href="#signin" className="inline-flex items-center gap-2 text-sm font-semibold bg-white text-[#1B365D] px-5 py-2.5 rounded-lg shadow hover:bg-[#E6ECF5] lg:hidden">
              Sign in <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Sign-in card */}
          <div id="signin" className="lg:col-span-2">
            <div className="bg-[var(--color-background-primary)] text-[var(--color-text-primary)] rounded-2xl shadow-2xl border border-white/10 p-7 space-y-5">
              <div>
                <h2 className="text-xl font-bold">Sign in to BLMS</h2>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">Use your authorized credentials to continue.</p>
              </div>

              {errorMsg && (
                <div role="alert" className="p-3 text-xs rounded-lg bg-[#FCEBEB] text-[#A32D2D] border border-[#F2B8B8]">{errorMsg}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="uid" className="text-xs font-semibold">User ID</label>
                  <input id="uid" type="text" autoComplete="username" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="Your User ID" required className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pw" className="text-xs font-semibold">Password</label>
                  <div className="relative">
                    <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className={inputCls + ' pr-10'} />
                    <button type="button" aria-label="Show or hide password" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 px-4 text-sm font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-lg shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Authenticating...' : <>Sign In <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
              <p className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Encrypted session. Five failed attempts lock sign-in for 15 minutes.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-6 -mt-8 relative">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[var(--color-background-primary)] rounded-2xl shadow-lg border border-[var(--color-border-secondary)] p-6">
          {stats.map(s => (
            <div key={s.l} className="text-center">
              <div className="text-3xl font-extrabold text-[var(--brand-text)]">{s.v}</div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Everything compliance teams need</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2">One secure system to track, verify and renew every license across the group.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <div key={f.title} className="bg-[var(--color-background-primary)] rounded-xl border border-[var(--color-border-secondary)] p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-lg bg-[var(--brand-light)] text-[var(--brand-text)] flex items-center justify-center mb-3"><f.icon className="w-5 h-5" /></div>
              <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[var(--color-border-secondary)] py-6 text-center text-xs text-[var(--color-text-secondary)]">
        Acme Group Corporate Compliance · BLMS
      </footer>
    </div>
  );
};
