import { CONTROL_HELP } from '../../game/input/keyboard';

export function ControlsHelp({ compact = false }: { compact?: boolean }) {
  return (
    <table className={`controls-help ${compact ? 'controls-help--compact' : ''}`}>
      <caption className="visually-hidden">Game controls</caption>
      <thead>
        <tr>
          <th scope="col">Action</th>
          <th scope="col">Keyboard</th>
          {!compact && <th scope="col">Touch</th>}
        </tr>
      </thead>
      <tbody>
        {CONTROL_HELP.map((c) => (
          <tr key={c.action}>
            <th scope="row">{c.action}</th>
            <td>
              <kbd>{c.keys}</kbd>
            </td>
            {!compact && <td>{c.touch}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
