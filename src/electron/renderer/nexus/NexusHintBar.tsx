/**
 * NexusHintBar — the 48px bottom hint strip showing the controller/keyboard
 * affordances, ported from the design's hint bar.
 */

export function NexusHintBar() {
  return (
    <div className="nx-hintbar">
      <span className="nx-hint">
        <kbd>←</kbd>
        <kbd>→</kbd>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        Navegar
      </span>
      <span className="nx-hint">
        <kbd className="kbd-a">Enter</kbd>
        Ver ficha
      </span>
      <span className="nx-hint">
        <kbd className="kbd-a">Doble clic</kbd>
        Jugar
      </span>
      <span className="nx-hint">
        <kbd className="kbd-b">Esc</kbd>
        Volver
      </span>
      <span className="nx-hint">
        <kbd>/</kbd>
        Buscar
      </span>
    </div>
  );
}
