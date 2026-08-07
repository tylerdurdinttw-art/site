/**
 * Квадрат карты по мировым координатам: тот же расчёт, что показывает игра.
 * Сетка идёт от северо-западного угла: буквы на восток, числа на юг.
 */

const CELL_SIZE = 146.3;

function columnLabel(index: number): string {
  // После Z идёт AA — как в таблицах.
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/** null — размер мира неизвестен или точка вне карты. */
export function gridSquare(x: number, z: number, worldSize: number | null): string | null {
  if (!worldSize || worldSize <= 0) return null;

  const half = worldSize / 2;
  if (x < -half || x > half || z < -half || z > half) return null;

  const cells = Math.ceil(worldSize / CELL_SIZE);
  const col = Math.min(cells - 1, Math.max(0, Math.floor((x + half) / CELL_SIZE)));
  const row = Math.min(cells - 1, Math.max(0, Math.floor((half - z) / CELL_SIZE)));

  return `${columnLabel(col)}${row}`;
}
