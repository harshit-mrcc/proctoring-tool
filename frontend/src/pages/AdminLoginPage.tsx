import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminLogin, fetchAdminSession } from "../api";
import { NavBar } from "../components/common/NavBar";
import { StatusText } from "../components/common/StatusText";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAdminSession()
      .then((data) => {
        if (data.authenticated) {
          navigate("/admin", { replace: true });
        }
      })
      .catch(() => {
        // no-op
      });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await adminLogin(password);
      navigate("/admin");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Login failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NavBar>
        <div className="nav-actions">
          <Link className="nav-link" to="/">
            Setup
          </Link>
        </div>
      </NavBar>
      <main className="container">
        <section className="card admin-login-card">
          <h1>Admin Login</h1>
          <p className="subtitle">
            Sign in to view registered users and violation evidence.
          </p>
          {error ? <StatusText text={error} isError={true} /> : null}
          <form className="admin-login-form" onSubmit={onSubmit}>
            <label htmlFor="password">Admin Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Login
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
