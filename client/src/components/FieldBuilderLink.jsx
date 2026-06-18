import { Link } from 'react-router-dom';
import { isBizAdmin } from '../utils';
import { useAuth } from '../context/AuthContext';

export default function FieldBuilderLink({ entity }) {
  const { user } = useAuth();
  if (!isBizAdmin(user)) return null;
  return (
    <Link to={`/fields?entity=${entity}`} className="btn-secondary btn-sm" title="Конструктор полей">
      🧩 Поля
    </Link>
  );
}
