import { InstanceModCategory, ModLoader, ModpackInstance, ProjectType } from '../types';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatPlaytime(ms: number): string {
  if (!ms || ms < 60_000) return '0 м';
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} м`;
  return `${hours} ч ${String(rest).padStart(2, '0')} м`;
}

export function formatPlaytimeShort(ms: number): string {
  const hours = Math.floor((ms || 0) / 3_600_000);
  if (hours < 1) return `${Math.max(0, Math.floor((ms || 0) / 60_000))}м`;
  return `${hours}ч`;
}

export function formatDownloads(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function relativeTime(value?: string | null): string {
  if (!value) return 'никогда';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return 'никогда';
  const diff = Date.now() - date;
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} дн назад`;
  return formatDate(value);
}

export function loaderLabel(loader: ModLoader): string {
  switch (loader) {
    case 'fabric':
      return 'Fabric';
    case 'forge':
      return 'Forge';
    case 'neoforge':
      return 'NeoForge';
    case 'quilt':
      return 'Quilt';
    default:
      return 'Vanilla';
  }
}

/**
 * Returns a human-readable instance name. Old/migrated instances sometimes
 * have technical names like `instance-96f2...` or only the raw game version;
 * those are replaced with a stable "<Loader> <version>" label.
 */
export function instanceDisplayName(instance?: ModpackInstance | null): string {
  if (!instance) return '';
  const raw = (instance.name || '').trim();
  const technical =
    !raw ||
    /^instance-[0-9a-z-]+$/i.test(raw) ||
    raw.toLowerCase() === String(instance.mcVersion || '').toLowerCase();
  if (!technical) return raw;
  const version = instance.mcVersion?.trim() || 'Minecraft';
  const loader = loaderLabel(instance.loader);
  return loader === 'Vanilla' ? `Minecraft ${version}` : `${loader} ${version}`;
}

export function projectTypeLabel(type: ProjectType): string {
  switch (type) {
    case 'modpack':
      return 'МОДПАК';
    case 'resourcepack':
      return 'РЕСУРСПАК';
    case 'shader':
      return 'ШЕЙДЕР';
    case 'datapack':
      return 'ДАТАПАК';
    default:
      return 'МОД';
  }
}

export function categoryLabel(category: InstanceModCategory): string {
  switch (category) {
    case 'resourcepack':
      return 'РЕСУРСПАК';
    case 'shader':
      return 'ШЕЙДЕР';
    case 'datapack':
      return 'ДАТАПАК';
    default:
      return 'МОД';
  }
}

export function truncateMiddle(value: string, max = 54): string {
  if (!value || value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

export function sanitizeCategory(category: string): string {
  return category.replace(/[-_]/g, ' ');
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
