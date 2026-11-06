import { Component } from "react";
import type { ReactNode } from "react";

// Last resort when a tab cannot load even after the automatic reload.
export class TabErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="notice" role="alert">
        <p>Não foi possível carregar esta aba. Verifique a conexão e recarregue a página.</p>
        <button onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}
