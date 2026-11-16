import {
  Scissors,
  Sparkles,
  Flag,
  PawPrint,
  Smile,
  GraduationCap,
  Apple,
  Leaf,
  Activity,
  Store,
} from 'lucide-react';

const ICONS = {
  scissors: Scissors,
  sparkles: Sparkles,
  flag: Flag,
  'paw-print': PawPrint,
  smile: Smile,
  'graduation-cap': GraduationCap,
  apple: Apple,
  leaf: Leaf,
  activity: Activity,
};

/** Ícono de la categoría (campo `icon` de /api/categories). */
export function CategoryIcon({ icon, ...props }) {
  const Icon = ICONS[icon] ?? Store;
  return <Icon {...props} />;
}
