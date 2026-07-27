import { useState } from 'react';
import { supabase } from './api';

/** Même compte que l'app mobile : l'API ne connaît qu'un utilisateur. */
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(
        error.message.toLowerCase().includes('invalid login')
          ? 'Email ou mot de passe incorrect.'
          : error.message,
      );
    }
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>Carto Airsoft</h1>
        <p className="muted">Console de préparation de partie</p>
        {error && <div className="error">{error}</div>}
        <div className="list" style={{ marginTop: 16 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Utilisez le compte de l’application mobile.
        </p>
      </form>
    </div>
  );
}
