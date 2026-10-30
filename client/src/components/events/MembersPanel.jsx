import { useState } from 'react';
import { api } from '../../api/client.js';
import { formatDate } from '../../utils/format.js';
import { Alert, RoleBadge } from '../Feedback.jsx';

/** Members list. The event head can switch people between edit/view access or remove them. */
export function MembersPanel({ eventId, members, isHead, currentUserId, onChange }) {
  const [error, setError] = useState('');

  async function changeRole(member, role) {
    setError('');
    try {
      await api(`/events/${eventId}/members/${member.id}`, { method: 'PATCH', body: { role } });
      onChange(members.map((m) => (m.id === member.id ? { ...m, role } : m)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(member) {
    if (!window.confirm(`Remove ${member.name} from this event?`)) return;
    setError('');
    try {
      await api(`/events/${eventId}/members/${member.id}`, { method: 'DELETE' });
      onChange(members.filter((m) => m.id !== member.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <Alert>{error}</Alert>
      <ul className="member-list">
        {members.map((member) => {
          const manageable = isHead && member.role !== 'head';
          return (
            <li key={member.id}>
              <span className="avatar" aria-hidden="true">
                {member.name[0]?.toUpperCase()}
              </span>
              <span className="member-info">
                <strong>
                  {member.name}
                  {member.id === currentUserId && ' (you)'}
                </strong>
                <span className="muted small">
                  {member.email ? `${member.email} · ` : ''}joined {formatDate(member.joinedAt)}
                </span>
              </span>
              {manageable ? (
                <span className="row gap-sm">
                  <label className="sr-only" htmlFor={`role-${member.id}`}>
                    Access for {member.name}
                  </label>
                  <select id={`role-${member.id}`} value={member.role} onChange={(e) => changeRole(member, e.target.value)}>
                    <option value="editor">Can edit</option>
                    <option value="viewer">View only</option>
                  </select>
                  <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => remove(member)} aria-label={`Remove ${member.name}`}>
                    Remove
                  </button>
                </span>
              ) : (
                <RoleBadge role={member.role} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
