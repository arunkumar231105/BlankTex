export default function Topbar({ onToggle, crumb }) {
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onToggle} aria-label="Toggle sidebar">☰</button>
      <span className="crumb">{crumb}</span>
      <div className="spacer" />
      <div className="user">
        <div className="avatar">AK</div>
        <div>
          <div className="user-name">Admin</div>
          <div className="user-role">BlankTex</div>
        </div>
      </div>
    </header>
  );
}
