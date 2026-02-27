import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminLogout, fetchAdminUser, type AdminUserEvent } from "../api";
import { NavBar } from "../components/common/NavBar";
import { StatusText } from "../components/common/StatusText";

export function AdminUserDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const userKey = (params.userKey || "").trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<{
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    samples: number;
  } | null>(null);
  const [events, setEvents] = useState<AdminUserEvent[]>([]);

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchAdminUser(userKey);
        setUser(data.user);
        setEvents(data.events || []);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load user details";
        if (message.toLowerCase().includes("unauthorized")) {
          navigate("/admin/login", { replace: true });
          return;
        }
        if (message.toLowerCase().includes("not found")) {
          navigate("/admin", { replace: true });
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    void run();
  }, [userKey]);

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
          <Link className="nav-link" to="/admin">
            Dashboard
          </Link>
          <button className="nav-link" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </NavBar>
      <main className="container">
        <section className="card">
          <h1>User: {user?.username || "-"}</h1>
          <p className="subtitle">
            Evidence snapshots captured on server-side violations.
          </p>
          {loading ? <p className="subtitle">Loading user details...</p> : null}
          {error ? <StatusText text={error} isError={true} /> : null}
          {!loading && user ? (
            <>
              <div className="summary-line">
                <span>User Key</span>
                <strong>{userKey}</strong>
              </div>
              <div className="summary-line">
                <span>Name</span>
                <strong>
                  {user.first_name} {user.last_name}
                </strong>
              </div>
              <div className="summary-line">
                <span>Email</span>
                <strong>{user.email || "-"}</strong>
              </div>
              <div className="summary-line">
                <span>Stored Face Samples</span>
                <strong>{user.samples}</strong>
              </div>
            </>
          ) : null}
        </section>

        <section className="card" style={{ marginTop: "12px" }}>
          <h2>Violation Captures</h2>
          {!loading && events.length > 0 ? (
            <div className="evidence-grid">
              {events.map((event, index) => (
                <article className="evidence-item" key={`${event.timestamp}-${index}`}>
                  <img
                    src={event.image_url}
                    alt="Violation capture"
                    loading="lazy"
                  />
                  <div className="evidence-meta">
                    <div>
                      <strong>Time:</strong> {event.timestamp}
                    </div>
                    <div>
                      <strong>Violations:</strong> {event.violations.join(", ")}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {!loading && events.length === 0 ? (
            <p className="subtitle">
              No captured violations for this user yet.
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}
