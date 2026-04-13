import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const navItems = [
  { path: '/', label: 'HOME' },
  { path: '/explore', label: 'EXPLORE' },
  { path: '/actors', label: 'ACTORS' },
  { path: '/proposals', label: 'PROPOSALS' },
  { path: '/relationships', label: 'RELATIONSHIPS' },
  { path: '/data', label: 'DATA' },
  { path: '/about', label: 'ABOUT' },
];

const SiteHeader = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <header className="brutalist-border-b">
      <div className="container py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="block shrink-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tighter leading-none">
              POLI·TRACK
            </h1>
            <p className="text-[10px] sm:text-xs font-mono text-muted-foreground mt-0.5">
              EU Political Data Explorer · Open Source
            </p>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex gap-0 font-mono text-xs">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 brutalist-border transition-colors ${
                  isActive(item.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 brutalist-border"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile nav */}
        {open && (
          <nav className="md:hidden mt-3 pt-3 border-t border-border font-mono text-xs grid grid-cols-2 gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={`px-3 py-2 brutalist-border text-center transition-colors ${
                  isActive(item.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
};

export default SiteHeader;
