import {
  ArrowDownLeft,
  ArrowLeftRight,
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Circle,
  Coffee,
  Droplet,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  PiggyBank,
  Plane,
  Play,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Chave salva em Category.icon -> ícone (traço 1.8, como no design). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  cart: ShoppingCart,
  bus: Bus,
  car: Car,
  fuel: Fuel,
  home: House,
  bolt: Zap,
  water: Droplet,
  wifi: Wifi,
  phone: Smartphone,
  subs: Repeat,
  fun: Play,
  game: Gamepad2,
  travel: Plane,
  health: HeartPulse,
  fitness: Dumbbell,
  shopping: ShoppingBag,
  clothes: Shirt,
  education: GraduationCap,
  book: BookOpen,
  pet: PawPrint,
  baby: Baby,
  gift: Gift,
  coffee: Coffee,
  beauty: Sparkles,
  work: Briefcase,
  savings: PiggyBank,
  tools: Wrench,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  other: Circle,
};

export function CategoryIcon({ icon, size = 20 }: { icon: string | undefined; size?: number }) {
  const Icon = CATEGORY_ICONS[icon ?? 'other'] ?? Circle;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Traços do design original para a tab bar. */
const TAB_PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  chart: 'M5 20V11M12 20V4M19 20v-6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  card: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M7 15h4',
};

export function TabIcon({ name }: { name: keyof typeof TAB_PATHS }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TAB_PATHS[name]} />
    </svg>
  );
}

/** Logo do Kaixa: K com uma moeda no braço superior. */
export function KaixaGlyph({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="24" y="20" width="15" height="60" rx="7.5" fill={color} />
      <line x1="48" y1="52" x2="70" y2="74" stroke={color} strokeWidth="15" strokeLinecap="round" />
      <circle cx="62" cy="31" r="12" fill={color} />
    </svg>
  );
}
