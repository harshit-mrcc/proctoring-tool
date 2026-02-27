import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  adminLogout,
  fetchAdminUsers,
  type AdminUserSummary,
} from "../api";
import { NavBar } from "../components/common/NavBar";
import { StatusText } from "../components/common/StatusText";

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchAdminUsers();
      setUsers(data.users || []);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load users";
      if (message.toLowerCase().includes("unauthorized")) {
        navigate("/admin/login", { replace: true });
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function onLogout() {
    await adminLogout().catch(() => {
      // no-op
    });
    navigate("/admin/login", { replace: true });
  }

  return (
    <>
      <NavBar>
        <div className="nav-actions">
          <Link className="nav-link" to="/">
            Setup
          </Link>
          <button className="nav-link" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </NavBar>
      <main className="container">
        <section className="card">
          <h1>Admin Dashboard</h1>
          <p className="subtitle">
            Registered users and captured violation evidence.
          </p>
          {loading ? <p className="subtitle">Loading users...</p> : null}
          {error ? <StatusText text={error} isError={true} /> : null}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Face Samples</th>
                  <th>Violations Captured</th>
                  <th>Last Violation (UTC)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  users.map((user) => (
                    <tr key={user.key}>
                      <td>{user.username}</td>
                      <td>{user.email || "-"}</td>
                      <td>{user.samples}</td>
                      <td>{user.violation_count}</td>
                      <td>{user.last_violation || "-"}</td>
                      <td>
                        <Link
                          className="btn"
                          to={`/admin/user/${encodeURIComponent(user.key)}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                {!loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No registered users found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
