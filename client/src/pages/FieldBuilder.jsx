import { Navigate, useSearchParams } from 'react-router-dom';

/** Старый URL /fields → настройки, вкладка «Поля». */
export default function FieldBuilder() {
  const [searchParams] = useSearchParams();
  const entity = searchParams.get('entity');
  const qs = entity ? `?tab=fields&entity=${entity}` : '?tab=fields';
  return <Navigate to={`/settings${qs}`} replace />;
}
