import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container-content flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <p className="font-display text-7xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Page not found</h1>
      <p className="mt-2 text-ink-500">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary mt-6">Back to home</Link>
    </div>
  );
}
