export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">React is wired up</p>
        <h1>Goodmittens now has a React app.</h1>
        <p className="lede">
          This lives alongside the existing static site, so you can build React
          components without replacing the current pages.
        </p>
        <div className="actions">
          <a className="button primary" href="/">
            Open static home
          </a>
          <span className="button secondary">Edit react-app/src/App.jsx</span>
        </div>
      </section>
    </main>
  );
}

