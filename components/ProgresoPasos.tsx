import { nombresPasos } from '@/lib/tramites';

export default function ProgresoPasos({
  pasoActual,
  colorHex,
}: {
  pasoActual: number;
  colorHex: string;
}) {
  return (
    <ol className="flex flex-col gap-2 px-5 py-4">
      {nombresPasos.map((nombre, i) => {
        const numero = i + 1;
        const completado = numero < pasoActual;
        const actual = numero === pasoActual;
        return (
          <li key={nombre} className="flex items-center gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-carta"
              style={{ backgroundColor: completado || actual ? colorHex : '#E4DCC9' }}
            >
              {completado ? '✓' : numero}
            </span>
            <span className={actual ? 'font-semibold text-tinta' : 'text-tinta-suave'}>
              {nombre}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
