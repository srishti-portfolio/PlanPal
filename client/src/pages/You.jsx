import { EmailChangeForm, PasswordChangeForm, ProfileForm } from '../components/you/AccountForms.jsx';
import { Notes } from '../components/you/Notes.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function You() {
  const { user, signOut } = useAuth();

  return (
    <div className="page">
      <header className="page-header row space-between">
        <div>
          <h1>You</h1>
          <p className="muted">{user.email}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="grid-2">
        <div className="stack">
          <section className="card" aria-labelledby="profile-title">
            <h2 id="profile-title">Profile</h2>
            <ProfileForm />
          </section>
          <section className="card" aria-labelledby="email-title">
            <h2 id="email-title">Change email</h2>
            <EmailChangeForm />
          </section>
          <section className="card" aria-labelledby="password-title">
            <h2 id="password-title">Change password</h2>
            <PasswordChangeForm />
          </section>
        </div>
        <section className="card" id="notes" aria-labelledby="notes-title">
          <h2 id="notes-title">Notes</h2>
          <Notes />
        </section>
      </div>
    </div>
  );
}
