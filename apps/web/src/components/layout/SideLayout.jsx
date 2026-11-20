import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Menu, LogOut, Lock, KeyRound } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * Layout con menú lateral (negocio y administrador).
 * groups: [{ label, locked?, unlocked?, items: [{ to, label, icon, count?, end? }] }]
 * footer: { icon, title, onLogout }
 */
export function SideLayout({ tag, home, groups, footer, topRight }) {
  const [open, setOpen] = useState(false);
  const nav = (
    <SideNav
      tag={tag}
      home={home}
      groups={groups}
      footer={footer}
      onNavigate={() => setOpen(false)}
    />
  );
  return (
    <div className="min-h-dvh bg-white md:flex">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 border-r border-border bg-sidebar md:block">
        {nav}
      </aside>
      <div className="flex h-14 items-center gap-2 border-b border-border px-3 md:hidden">
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-lg hover:bg-surface"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="size-6" />
        </button>
        <Logo to={home} size="sm" tag={tag} />
        <div className="ml-auto">{topRight}</div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          {nav}
        </SheetContent>
      </Sheet>
      <main
        id="contenido"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 py-5 outline-none md:px-10 md:py-8"
      >
        <Outlet />
      </main>
    </div>
  );
}

function SideNav({ tag, home, groups, footer, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <Logo to={home} size="sm" tag={tag} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3" aria-label="Menú">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase">
              {g.locked !== undefined &&
                (g.locked ? <Lock className="size-3" /> : <KeyRound className="size-3" />)}
              {g.label}
              {g.locked && (
                <span className="ml-auto text-[11px] font-semibold tracking-normal text-disabled normal-case">
                  Con PIN
                </span>
              )}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex h-[38px] items-center gap-3 rounded-lg px-3 text-sm',
                        isActive
                          ? 'bg-primary-soft font-extrabold text-primary'
                          : 'font-semibold text-foreground hover:bg-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <it.icon
                          className={cn(
                            'size-[18px]',
                            isActive ? 'text-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className="truncate">{it.label}</span>
                        {it.count > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-extrabold text-white">
                            {it.count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && (
        <div className="mx-3 flex items-center gap-3 border-t border-border py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-primary">
            <footer.icon className="size-[18px]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold">{footer.title}</p>
            <button
              type="button"
              onClick={footer.onLogout}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
