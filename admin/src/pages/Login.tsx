import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../lib/api';
import { setAdminSession } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const r = await adminLogin(username.trim(), password);
      setAdminSession(r.token, r.username);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adm-login-shell">
      <form className="adm-login-card" onSubmit={onSubmit}>
        <h2>Aieats 运营后台</h2>
        <p className="adm-login-sub">仅授权管理员可用</p>
        {error && <div className="adm-error">{error}</div>}
        <div className="adm-field">
          <label htmlFor="adm-user">用户名</label>
          <input
            id="adm-user"
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="adm-field">
          <label htmlFor="adm-pass">密码</label>
          <input
            id="adm-pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="adm-btn-primary" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
