import { Link } from 'react-router-dom';
export function ProfileName({ id, name }: { id?: string | null; name?: string | null }) {
  return id ? <Link to={`/members/${id}`} className="hover:underline focus-visible:underline">{name || 'View member'}</Link> : <span>{name || 'Unknown member'}</span>;
}
