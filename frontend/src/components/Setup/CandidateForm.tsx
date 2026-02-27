import { type CSSProperties } from "react";

interface CandidateFormProps {
  firstName: string;
  lastName: string;
  email: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
}

export function CandidateForm({
  firstName,
  lastName,
  email,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
}: CandidateFormProps) {
  return (
    <div className="candidate-grid">
      <div>
        <label htmlFor="firstName">First Name</label>
        <input
          id="firstName"
          type="text"
          placeholder="Enter first name"
          autoComplete="given-name"
          value={firstName}
          onChange={(event) => onFirstNameChange(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="lastName">Last Name</label>
        <input
          id="lastName"
          type="text"
          placeholder="Enter last name"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => onLastNameChange(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="email">Email (Optional)</label>
        <input
          id="email"
          type="text"
          placeholder="name@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </div>
    </div>
  );
}
