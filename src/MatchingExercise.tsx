import type { Exercise } from "./types";

export function MatchingTable({ exercise }: { exercise: Exercise }) {
  const table = exercise.matchingTable;
  if (!table) return null;
  return (
    <div
      className="matching-table-scroll"
      role="region"
      aria-label="Правила и предложения"
      tabIndex={0}
    >
      <table className="matching-table">
        <colgroup>
          <col className="matching-left-column" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{table.leftTitle}</th>
            <th scope="col">{table.rightTitle}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {table.left.map((item) => (
                <p key={item.id}>
                  {item.id}) {item.text}
                </p>
              ))}
            </td>
            <td>
              {table.right.map((item) => (
                <p key={item.id}>
                  {item.id}) {item.text}
                </p>
              ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function MatchingAnswer({ exercise }: { exercise: Exercise }) {
  const columns = exercise.matchingTable?.left || [];
  return (
    <table className="matching-answer">
      <thead>
        <tr>
          {columns.map((item) => (
            <th scope="col" key={item.id}>
              {item.id}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {columns.map((item) => (
            <td key={item.id}>{"\u00a0"}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
