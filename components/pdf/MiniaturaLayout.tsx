import { plantillaPorId, type PlantillaId } from '@/lib/pdfLayout';

/** Hoja en miniatura hecha solo con divs: muestra cómo se reparte una plantilla. */
export default function MiniaturaLayout({ plantilla, ancho = 64 }: { plantilla: PlantillaId; ancho?: number }) {
  const { ranuras } = plantillaPorId(plantilla);
  return (
    <div className="relative rounded-sm border border-black/20 bg-white shadow-sm" style={{ width: ancho, height: ancho * 1.414 }} aria-hidden>
      <div className="absolute" style={{ inset: '6%' }}>
        {ranuras.map((r, i) => (
          <div
            key={i}
            className="absolute rounded-[2px] bg-oficial/70"
            style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%', border: '1.5px solid white' }}
          />
        ))}
      </div>
    </div>
  );
}
