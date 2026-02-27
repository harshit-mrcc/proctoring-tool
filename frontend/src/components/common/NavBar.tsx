import { Link } from "react-router-dom";
import { type ReactNode } from "react";

interface NavBarProps {
  children?: ReactNode;
}

export function NavBar({ children }: NavBarProps) {
  return (
    <header className="navbar">
      <div className="nav-inner">
        <div className="brand">Proctoring Tool</div>
        {children}
      </div>
    </header>
  );
}
