import { Link, useSearchParams } from "react-router-dom";
import { parsePositiveInt } from "../utils/helpers";
import { NavBar } from "../components/common/NavBar";

export function ThankYouPage() {
  const [searchParams] = useSearchParams();
  const username = searchParams.get("username") || "";
  const answered = parsePositiveInt(searchParams.get("answered"), 0);
  const unanswered = parsePositiveInt(searchParams.get("unanswered"), 0);
  const violations = parsePositiveInt(searchParams.get("violations"), 0);
  const trustScore = Math.max(0, 100 - violations * 5);

  return (
    <>
      <NavBar>
        <Link className="nav-link" to="/">
          Home
        </Link>
      </NavBar>
      <main className="container">
        <section className="card summary-card">
          <h1>Thank You</h1>
          <p className="subtitle">
            Candidate: <strong>{username || "-"}</strong>
          </p>
          <div className="summary-line">
            <span>Total Answered</span>
            <strong>{answered}</strong>
          </div>
          <div className="summary-line">
            <span>Total Unanswered</span>
            <strong>{unanswered}</strong>
          </div>
          <div className="summary-line">
            <span>Total Violations</span>
            <strong>{violations}</strong>
          </div>
          <div className="summary-line trust">
            <span>Trust Score</span>
            <strong>{trustScore} / 100</strong>
          </div>
          <p className="subtitle">Please close this tab.</p>
        </section>
      </main>
    </>
  );
}
