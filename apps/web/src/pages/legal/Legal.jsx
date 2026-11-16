import { PageHeader } from '@/components/PageHeader';

const DOCS = {
  privacidad: {
    title: 'Aviso de privacidad',
    sections: [
      [
        'Quién es responsable',
        'ReserYa es un proyecto escolar de la Universidad Autónoma de Baja California, campus Ensenada. Los datos se usan solo para que funcione la plataforma.',
      ],
      [
        'Qué datos guardamos',
        'Nombre, correo, teléfono, las reservas que haces y tus reseñas. Si entras con Google, recibimos tu nombre y correo. No guardamos datos de tarjetas: el pago lo procesa Stripe.',
      ],
      [
        'Para qué los usamos',
        'Para crear tu cuenta, mandarte avisos de tus reservas y que el negocio pueda contactarte por tu cita. El negocio solo ve tu nombre y teléfono en las reservas que hiciste con él.',
      ],
      [
        'Tus derechos',
        'Puedes editar tus datos desde tu perfil. Para borrar tu cuenta, escríbenos al correo del proyecto.',
      ],
    ],
  },
  terminos: {
    title: 'Términos de uso',
    sections: [
      [
        'Reservas',
        'Al reservar, el monto se aparta en tu tarjeta. Solo se cobra cuando el negocio acepta. Si lo rechaza o no responde a tiempo, se libera.',
      ],
      [
        'Cancelaciones',
        'Puedes cancelar con reembolso completo antes del límite que fija cada negocio. Después del límite ya no se puede cancelar desde la app.',
      ],
      [
        'Reseñas',
        'Solo puedes calificar citas completadas, una vez por cita. Las reseñas deben ser respetuosas.',
      ],
      [
        'Negocios',
        'Los negocios se registran con una clave y los aprueba el administrador. Cada negocio es responsable de sus servicios.',
      ],
      [
        'Proyecto escolar',
        'ReserYa es un proyecto académico. Los pagos funcionan en modo de prueba de Stripe y no se cobra dinero real.',
      ],
    ],
  },
};

export default function Legal({ doc }) {
  const d = DOCS[doc];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={d.title} back />
      <div className="space-y-5">
        {d.sections.map(([h, p]) => (
          <section key={h}>
            <h2 className="text-base font-extrabold">{h}</h2>
            <p className="mt-1 text-[15px] leading-6 text-muted-foreground">{p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
