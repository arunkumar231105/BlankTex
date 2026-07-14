export default function Topbar({ onToggle, crumb, user, onLogout }) {
  const initials = (user?.display_name || user?.email || 'A').split(/\s+|@/).filter(Boolean)
    .slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onToggle} aria-label="Toggle sidebar">☰</button>
      <span className="crumb">{crumb}</span>
      <div className="spacer" />
      <div className="user">
        <div className="avatar">{initials}</div>
        <div>
          <div className="user-name">{user?.display_name || 'Admin'}</div>
          <div className="user-role">{user?.email}</div>
        </div>
      </div>
      <button className="topbar-logout" type="button" onClick={onLogout} title="Sign out of BlankTex">
        <span>↪</span> Logout
      </button>
    </header>
  );
}
