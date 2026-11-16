// Perfil público del negocio y fotos (RF-14). Modo dueño.
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  MapPin,
  Phone,
  X,
  Upload,
} from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { phone as formatPhone } from '@/lib/format';
import { useCategories } from '@/hooks/useConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Photo } from '@/components/Photo';
import { PageHeader } from '@/components/PageHeader';
import { LoadingList, ErrorState } from '@/components/States';
import { useProfile, useSetupMutation, PROFILE_KEY } from '@/features/business-setup/api';
import { CategoryPicker, Section } from '@/features/business-setup/components';
import { MAX_PHOTOS, MAX_PHOTO_MB, PHOTO_TYPES } from '@/features/business-setup/constants';
import { ME_KEY } from '@/hooks/useAuth';

export default function PublicProfile() {
  const q = useProfile();
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Perfil público"
        subtitle="Lo que ven tus clientes cuando encuentran tu negocio."
      />
      {q.isLoading ? (
        <LoadingList rows={3} itemClassName="h-40" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <Editor profile={q.data} />
      )}
    </div>
  );
}

function Editor({ profile }) {
  const [f, setF] = useState(() => ({
    name: profile.name ?? '',
    categoryId: profile.categoryId,
    description: profile.description ?? '',
    address: profile.address ?? '',
    phone: profile.phone ?? '',
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = useSetupMutation(
    (body) => api('/business/profile', { method: 'PATCH', body }),
    [PROFILE_KEY, ME_KEY],
    { onSuccess: () => toast.success('Perfil guardado') },
  );
  const err = save.error;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Section title="Datos del negocio">
          <form
            onSubmit={(e) => (
              e.preventDefault(),
              save.mutate({ ...f, phone: f.phone.trim() === '' ? null : f.phone })
            )}
            noValidate
            className="space-y-4"
          >
            <Field label="Nombre" error={fieldError(err, 'name')}>
              <Input value={f.name} onChange={set('name')} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-[13px] font-bold">Categoría</legend>
              <CategoryPicker
                value={f.categoryId}
                onChange={(categoryId) => setF({ ...f, categoryId })}
                invalid={Boolean(fieldError(err, 'categoryId'))}
              />
            </fieldset>
            <Field
              label="Descripción"
              error={fieldError(err, 'description')}
              hint={`${f.description.length}/1000 · Qué haces, qué te distingue, si hay estacionamiento…`}
            >
              <Textarea
                value={f.description}
                onChange={set('description')}
                maxLength={1000}
                placeholder="Cortes clásicos y modernos en el centro de Ensenada."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dirección" error={fieldError(err, 'address')}>
                <Input
                  value={f.address}
                  onChange={set('address')}
                  placeholder="Av. Ruiz 123, Zona Centro"
                />
              </Field>
              <Field label="Teléfono" error={fieldError(err, 'phone')}>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={f.phone}
                  onChange={set('phone')}
                  placeholder="646 123 4567"
                />
              </Field>
            </div>
            {err && !err.details && <Notice kind="error">{err.message}</Notice>}
            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                Guardar perfil
              </Button>
            </div>
          </form>
        </Section>
        <Photos photos={profile.photos} />
      </div>
      <div className="lg:sticky lg:top-8">
        <Preview form={f} photo={profile.photos[0]?.url} />
      </div>
    </div>
  );
}

function Preview({ form, photo }) {
  const { data: categories } = useCategories();
  const cat = categories?.find((c) => c.id === form.categoryId);
  return (
    <div>
      <p className="mb-2 text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase">
        Vista previa
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <Photo url={photo} icon={cat?.icon} alt="" className="aspect-[16/10] w-full" />
        <div className="p-4">
          <p className="text-lg font-extrabold">{form.name || 'Nombre del negocio'}</p>
          <p className="text-[13px] text-muted-foreground">{cat?.name ?? 'Categoría'}</p>
          {form.description && (
            <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line">{form.description}</p>
          )}
          <div className="mt-3 space-y-1.5 text-[13px] text-muted-foreground">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {form.address || 'Sin dirección'}
            </p>
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" />
              {form.phone ? formatPhone(form.phone.replace(/\D/g, '')) : 'Sin teléfono'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Photos({ photos }) {
  const inputRef = useRef(null);
  const pendingRef = useRef([]);
  const [pending, setPending] = useState([]); // [{ file, url }]
  const setPendingBoth = (list) => {
    pendingRef.current = list;
    setPending(list);
  };
  // Libera las vistas previas al salir de la página.
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const left = MAX_PHOTOS - photos.length - pending.length;

  const pick = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const ok = [];
    for (const file of files) {
      if (!PHOTO_TYPES.includes(file.type)) toast.error(`${file.name}: solo JPG, PNG o WEBP`);
      else if (file.size > MAX_PHOTO_MB * 1024 * 1024)
        toast.error(`${file.name}: pesa más de ${MAX_PHOTO_MB} MB`);
      else ok.push(file);
    }
    if (ok.length > left) toast.error(`Solo puedes agregar ${Math.max(left, 0)} fotos más`);
    const added = ok.slice(0, Math.max(left, 0)).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPendingBoth([...pending, ...added]);
  };

  const unpick = (i) => {
    URL.revokeObjectURL(pending[i].url);
    setPendingBoth(pending.filter((_, j) => j !== i));
  };

  const upload = useSetupMutation(
    () => {
      const fd = new FormData();
      pending.forEach((p) => fd.append('photos', p.file));
      return api('/business/photos', { method: 'POST', body: fd });
    },
    [PROFILE_KEY],
    {
      onSuccess: () => {
        pending.forEach((p) => URL.revokeObjectURL(p.url));
        setPendingBoth([]);
        toast.success('Fotos subidas');
      },
    },
  );
  const reorder = useSetupMutation(
    (ids) => api('/business/photos/order', { method: 'PUT', body: { ids } }),
    [PROFILE_KEY],
  );
  const remove = useSetupMutation(
    (id) => api(`/business/photos/${id}`, { method: 'DELETE' }),
    [PROFILE_KEY],
    { onSuccess: () => toast.success('Foto borrada') },
  );
  const move = (i, d) => {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    reorder.mutate(ids);
  };
  const busy = reorder.isPending || remove.isPending;

  return (
    <Section
      title="Fotos"
      description={`Hasta ${MAX_PHOTOS} fotos JPG, PNG o WEBP de hasta ${MAX_PHOTO_MB} MB. La primera es la portada.`}
    >
      {photos.length === 0 && pending.length === 0 && (
        <Notice kind="info" className="mb-4">
          Sin fotos mostramos un cuadro de color con el ícono de tu categoría.
        </Notice>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="relative">
              <img
                src={p.url}
                alt={`Foto ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
              {i === 0 && (
                <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white uppercase">
                  Portada
                </span>
              )}
            </div>
            <div className="flex items-center justify-between p-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Mover foto ${i + 1} a la izquierda`}
                disabled={i === 0 || busy}
                onClick={() => move(i, -1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Borrar foto ${i + 1}`}
                disabled={busy}
                onClick={() => remove.mutate(p.id)}
              >
                <Trash2 className="text-error" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Mover foto ${i + 1} a la derecha`}
                disabled={i === photos.length - 1 || busy}
                onClick={() => move(i, 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </li>
        ))}
        {pending.map((p, i) => (
          <li
            key={p.url}
            className="relative overflow-hidden rounded-xl border border-dashed border-primary bg-primary-soft"
          >
            <img
              src={p.url}
              alt={`Foto nueva ${i + 1} (sin subir)`}
              className="aspect-square w-full object-cover opacity-80"
            />
            <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-primary">
              Sin subir
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label={`Quitar foto nueva ${i + 1}`}
              onClick={() => unpick(i)}
            >
              <X />
            </Button>
          </li>
        ))}
        {left > 0 && (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-field bg-surface text-sm font-bold text-primary outline-none hover:bg-primary-soft focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <ImagePlus className="size-6" />
              Agregar fotos
            </button>
          </li>
        )}
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={pick}
      />
      {upload.error && (
        <Notice kind="error" className="mt-4">
          {upload.error.message}
        </Notice>
      )}
      {pending.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <p className="text-sm text-muted-foreground">
            {pending.length === 1
              ? '1 foto lista para subir'
              : `${pending.length} fotos listas para subir`}
          </p>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending}>
            <Upload /> {upload.isPending ? 'Subiendo…' : 'Subir fotos'}
          </Button>
        </div>
      )}
    </Section>
  );
}
