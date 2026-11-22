import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'sidenav__item sidenav__item--active' : 'sidenav__item';

/** Top bar and left navigation column. Rendered only inside the signed-in layout. */
export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <span className="topbar__title">Playbook Builder</span>
        <span className="topbar__user">{user?.email}</span>
      </header>
      <nav className="sidenav" aria-label="Main">
        <NavLink to="/playbooks" className={itemClass}>
          Create Playbook
        </NavLink>
        <NavLink to="/simulate" className={itemClass}>
          Simulate Event
        </NavLink>
        <button type="button" className="btn btn--secondary sidenav__logout" onClick={() => void logout()}>
          Logout
        </button>
      </nav>
    </>
  );
}
