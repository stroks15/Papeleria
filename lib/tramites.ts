export type CampoTramite = {
  id: string;
  etiqueta: string;
  placeholder: string;
  ayuda: string;
};

export type Tramite = {
  slug: string;
  nombre: string;
  emoji: string;
  descripcionCorta: string;
  colorHex: string;
  colorSuaveHex: string;
  urlOficial: string;
  campos: CampoTramite[];
  autofillContacto?: {
    lada: string;
    telefono: string;
    correo: string;
  };
};

// Para agregar un trámite nuevo: añade un objeto aquí. No hay que tocar
// ninguna otra parte del sistema — la pantalla principal y el flujo de
// pasos se generan solos a partir de esta lista.
export const tramites: Tramite[] = [
  {
    slug: 'recibo-cfe',
    nombre: 'Recibo CFE',
    emoji: '📄',
    descripcionCorta: 'Consulta e imprime tu recibo de luz',
    colorHex: '#C99A2E',
    colorSuaveHex: '#F3E6C4',
    urlOficial: 'https://app.cfe.mx/Aplicaciones/CCFE/ReciboDeLuzGMX/Consulta',
    campos: [
      {
        id: 'nombreServicio',
        etiqueta: 'Nombre del servicio',
        placeholder: 'Como aparece en tu recibo',
        ayuda:
          'Es el nombre completo que aparece en la parte de arriba de tu recibo anterior.',
      },
      {
        id: 'numeroServicio',
        etiqueta: 'Número de servicio',
        placeholder: 'Ej. 123456789012',
        ayuda:
          'Este campo corresponde al número de servicio. Puedes encontrarlo en tu recibo anterior.',
      },
    ],
    autofillContacto: {
      lada: '55',
      telefono: '57445419',
      correo: 'dexterh4ck@gmail.com',
    },
  },
  {
    slug: 'tenencia-cdmx',
    nombre: 'Tenencia CDMX',
    emoji: '🚗',
    descripcionCorta: 'Consulta y paga tu tenencia vehicular',
    colorHex: '#3F8F5F',
    colorSuaveHex: '#DCEEE1',
    urlOficial: 'https://data.finanzas.cdmx.gob.mx/Front_ten/',
    campos: [
      {
        id: 'placa',
        etiqueta: 'Número de placas',
        placeholder: 'Ej. ABC1234',
        ayuda:
          'Lo encuentras en tu tarjeta de circulación o directamente en las placas de tu auto.',
      },
    ],
  },
  {
    slug: 'tenencia-edomex',
    nombre: 'Tenencia Estado de México',
    emoji: '🚙',
    descripcionCorta: 'Consulta y paga tu tenencia vehicular',
    colorHex: '#7A5CA8',
    colorSuaveHex: '#E7E0F2',
    urlOficial:
      'https://tenencia.edomex.gob.mx/TenenciaIndividual/tenencia/A06E1A88B8A6ED4B/#/',
    campos: [
      {
        id: 'placa',
        etiqueta: 'Número de placas',
        placeholder: 'Ej. ABC1234',
        ayuda:
          'Lo encuentras en tu tarjeta de circulación o directamente en las placas de tu auto.',
      },
    ],
  },
  {
    slug: 'multas-edomex',
    nombre: 'Multas Estado de México',
    emoji: '⚠️',
    descripcionCorta: 'Consulta si tienes infracciones pendientes',
    colorHex: '#C9503A',
    colorSuaveHex: '#F5DFD8',
    urlOficial: 'https://infracciones.ssedomex.gob.mx/Search',
    campos: [
      {
        id: 'placa',
        etiqueta: 'Número de placas',
        placeholder: 'Ej. ABC1234',
        ayuda:
          'Lo encuentras en tu tarjeta de circulación o directamente en las placas de tu auto.',
      },
    ],
  },
  {
    slug: 'multas-cdmx',
    nombre: 'Multas CDMX',
    emoji: '⚠️',
    descripcionCorta: 'Consulta tus adeudos por infracciones',
    colorHex: '#D9791F',
    colorSuaveHex: '#F6E4D0',
    urlOficial: 'https://data.finanzas.cdmx.gob.mx/consulta_adeudos',
    campos: [
      {
        id: 'placa',
        etiqueta: 'Número de placas',
        placeholder: 'Ej. ABC1234',
        ayuda:
          'Lo encuentras en tu tarjeta de circulación o directamente en las placas de tu auto.',
      },
    ],
  },
  {
    slug: 'agua-sacmex',
    nombre: 'Pago de agua',
    emoji: '💧',
    descripcionCorta: 'Imprime tu recibo de agua para pagar',
    colorHex: '#3D74A6',
    colorSuaveHex: '#DAE8F1',
    urlOficial: 'https://aplicaciones.sacmex.cdmx.gob.mx/fut/',
    campos: [
      {
        id: 'cuenta',
        etiqueta: 'Número de cuenta',
        placeholder: 'Como aparece en tu recibo anterior',
        ayuda: 'Lo encuentras en la parte superior de tu último recibo de agua.',
      },
    ],
  },
];

export function getTramitePorSlug(slug: string): Tramite | undefined {
  return tramites.find((t) => t.slug === slug);
}

export const nombresPasos = [
  'Elegir trámite',
  'Capturar información',
  'Revisar datos',
  'Obtener documento',
];
