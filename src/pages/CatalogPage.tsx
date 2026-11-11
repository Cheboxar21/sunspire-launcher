import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Download,
  ExternalLink,
  FileArchive,
  Heart,
  Loader2,
  Package,
  Palette,
  RefreshCw,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { ModrinthHit, ProjectType, SearchOptions } from '../types';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import {
  cx,
  formatDownloads,
  instanceDisplayName,
  projectTypeLabel,
  relativeTime,
  sanitizeCategory
} from '../lib/format';
import { PageHeader, Tag, EmptyState, ProgressBar } from '../components/ui/Common';

interface CatalogPageProps {
  projectType: ProjectType;
  onProjectTypeChange: (type: ProjectType) => void;
  onOpenProject: (projectId: string) => void;
}

const projectTypes: { type: ProjectType; label: string; icon: React.ReactNode }[] = [
  { type: 'mod', label: 'МОДЫ', icon: <Package size={14} /> },
  { type: 'modpack', label: 'МОДПАКИ', icon: <Boxes size={14} /> },
  { type: 'resourcepack', label: 'РЕСУРСПАКИ', icon: <Palette size={14} /> },
  { type: 'shader', label: 'ШЕЙДЕРЫ', icon: <Sparkles size={14} /> }
];

const loaderOptions = [
  { value: 'any', label: 'ЛЮБОЙ ЗАГРУЗЧИК' },
  { value: 'fabric', label: 'FABRIC' },
  { value: 'quilt', label: 'QUILT' },
  { value: 'forge', label: 'FORGE' },
  { value: 'neoforge', label: 'NEOFORGE' }
];

const sortOptions = [
  { value: 'relevance', label: 'ПО РЕЛЕВАНТНОСТИ' },
  { value: 'downloads', label: 'ПО ЗАГРУЗКАМ' },
  { value: 'follows', label: 'ПО ПОДПИСКАМ' },
  { value: 'newest', label: 'НОВЫЕ' },
  { value: 'updated', label: 'ОБНОВЛЁННЫЕ' }
];

const categories: Record<ProjectType, string[]> = {
  mod: [
    'adventure',
    'decoration',
    'equipment',
    'food',
    'game-mechanics',
    'library',
    'magic',
    'management',
    'mobs',
    'optimization',
    'storage',
    'technology',
    'transportation',
    'utility',
    'worldgen'
  ],
  modpack: [
    'adventure',
    'challenging',
    'combat',
    'kitchen-sink',
    'light',
    'magic',
    'multiplayer',
    'optimization',
    'quests',
    'technology'
  ],
  resourcepack: [
    'audio',
    'blocks',
    'combat',
    'decoration',
    'fonts',
    'gui',
    'items',
    'realistic',
    'simplified',
    'themed',
    'tweaks',
    'vanilla-like'
  ],
  shader: [
    'atmosphere',
    'bloom',
    'cartoon',
    'colored-lighting',
    'fantasy',
    'foliage',
    'low-end',
    'path-tracing',
    'realistic',
    'reflections',
    'semi-realistic',
    'water'
  ],
  datapack: ['adventure', 'game-mechanics', 'library', 'mobs', 'utility', 'worldgen']
};

const categoryTitles: Record<string, string> = {
  adventure: 'ПРИКЛЮЧЕНИЯ',
  decoration: 'ДЕКОР',
  equipment: 'СНАРЯЖЕНИЕ',
  food: 'ЕДА',
  'game-mechanics': 'МЕХАНИКИ',
  library: 'БИБЛИОТЕКИ',
  magic: 'МАГИЯ',
  management: 'УПРАВЛЕНИЕ',
  mobs: 'МОБЫ',
  optimization: 'ОПТИМИЗАЦИЯ',
  storage: 'ХРАНЕНИЕ',
  technology: 'ТЕХНОЛОГИИ',
  transportation: 'ТРАНСПОРТ',
  utility: 'УТИЛИТЫ',
  worldgen: 'ГЕНЕРАЦИЯ',
  combat: 'БОЙ',
  challenging: 'ИСПЫТАНИЕ',
  'kitchen-sink': 'ВСЁ СРАЗУ',
  light: 'ЛЁГКИЕ',
  multiplayer: 'МУЛЬТИПЛЕЕР',
  quests: 'КВЕСТЫ',
  audio: 'ЗВУК',
  blocks: 'БЛОКИ',
  fonts: 'ШРИФТЫ',
  gui: 'ИНТЕРФЕЙС',
  items: 'ПРЕДМЕТЫ',
  realistic: 'РЕАЛИЗМ',
  simplified: 'МИНИМАЛИЗМ',
  themed: 'ТЕМАТИЧЕСКИЕ',
  tweaks: 'ТВИКИ',
  'vanilla-like': 'ВАНИЛЬНЫЕ',
  atmosphere: 'АТМОСФЕРА',
  bloom: 'СВЕЧЕНИЕ',
  cartoon: 'МУЛЬТЯШНЫЕ',
  'colored-lighting': 'ЦВЕТНОЙ СВЕТ',
  fantasy: 'ФЭНТЕЗИ',
  foliage: 'РАСТИТЕЛЬНОСТЬ',
  'low-end': 'СЛАБЫЕ ПК',
  'path-tracing': 'PATH TRACING',
  reflections: 'ОТРАЖЕНИЯ',
  'semi-realistic': 'ПОЛУРЕАЛИЗМ',
  water: 'ВОДА',
  datapack: 'ДАТАПАКИ'
};

const PAGE_SIZE = 20;

export const CatalogPage: React.FC<CatalogPageProps> = ({
  projectType,
  onProjectTypeChange,
  onOpenProject
}) => {
  const { activeInstance, installProject, installModpack, importMrpack, showToast } = useLauncher();
  const initialRelease = activeInstance?.mcVersion || '';

  const [versionManifest, setVersionManifest] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [gameVersion, setGameVersion] = useState(initialRelease);
  const [loader, setLoader] = useState(
    activeInstance && activeInstance.loader !== 'vanilla' ? activeInstance.loader : 'any'
  );
  const [sort, setSort] = useState<SearchOptions['sort']>('relevance');
  const [category, setCategory] = useState('');
  const [hits, setHits] = useState<ModrinthHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef(0);

  const loaderRelevant = projectType === 'mod' || projectType === 'modpack';

  useEffect(() => {
    let cancelled = false;
    api.mc
      .versions()
      .then((manifest) => {
        if (cancelled) return;
        const releases = manifest.versions
          .filter((version) => version.type === 'release')
          .map((version) => version.id);
        const extra =
          initialRelease && !releases.includes(initialRelease) ? [initialRelease] : [];
        setVersionManifest([...extra, ...releases].slice(0, 60));
      })
      .catch(() => {
        if (!cancelled) setVersionManifest(initialRelease ? [initialRelease] : []);
      });
    return () => {
      cancelled = true;
    };
  }, [initialRelease]);

  // debounce input
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 420);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    if (!loaderRelevant && loader !== 'any') {
      setLoader('any');
    }
  }, [loaderRelevant, loader]);

  useEffect(() => {
    setCategory('');
  }, [projectType]);

  const runSearch = useCallback(
    async (append: boolean) => {
      const requestId = ++requestRef.current;
      const offset = append ? hits.length : 0;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await api.modrinth.search({
          query,
          projectType,
          gameVersion: gameVersion || undefined,
          loader: loader === 'any' ? undefined : loader,
          category: category || undefined,
          sort,
          offset,
          limit: PAGE_SIZE
        });
        if (requestId !== requestRef.current) return;
        setHits((current) => (append ? [...current, ...result.hits] : result.hits));
        setTotal(result.total);
        setError(null);
      } catch (searchError) {
        if (requestId !== requestRef.current) return;
        setError(searchError instanceof Error ? searchError.message : String(searchError));
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query, projectType, gameVersion, loader, category, sort, hits.length]
  );

  useEffect(() => {
    void runSearch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, projectType, gameVersion, loader, category, sort]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const quickInstall = async (hit: ModrinthHit) => {
    if (installingId) return;
    setInstallingId(hit.project_id);
    try {
      if (hit.project_type === 'modpack') {
        const installed = await installModpack(hit.project_id);
        if (!installed) {
          showToast('Не удалось установить модпак.', 'error');
        }
      } else {
        const installed = await installProject(hit.project_id, undefined, activeInstance?.id);
        if (!installed) {
          showToast('Не удалось установить проект.', 'error');
        }
      }
    } finally {
      setInstallingId(null);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await importMrpack();
    } finally {
      setImporting(false);
    }
  };

  const totalLabel = useMemo(() => {
    if (loading) return 'ПОИСК…';
    return `${formatDownloads(total)} ПРОЕКТОВ`;
  }, [loading, total]);

  return (
    <div className="page catalog-page">
      <PageHeader
        kicker="// MODRINTH CATALOG"
        title="КАТАЛОГ"
        description="Моды, модпаки, ресурспаки и шейдеры — напрямую из Modrinth. Установка в один клик в активную сборку."
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleImport()}
              disabled={importing}
            >
              {importing ? <Loader2 size={14} className="spin" /> : <FileArchive size={14} />}
              ИМПОРТ .MRPACK
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => api.app.openExternal('https://modrinth.com')}
            >
              <ExternalLink size={14} />
              MODRINTH.COM
            </button>
          </>
        }
      />

      <div className="catalog-tabs" role="tablist">
        {projectTypes.map((type) => (
          <button
            key={type.type}
            type="button"
            role="tab"
            aria-selected={projectType === type.type}
            className={cx('catalog-tab', projectType === type.type && 'is-active')}
            onClick={() => onProjectTypeChange(type.type)}
          >
            {type.icon}
            <span>{type.label}</span>
            {projectType === type.type && <span className="catalog-tab-led" />}
          </button>
        ))}
      </div>

      <div className="catalog-toolbar panel">
        <form
          className="catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(queryInput.trim());
          }}
        >
          <Search size={16} className="catalog-search-icon" />
          <input
            ref={searchRef}
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder={`Поиск: ${projectTypeLabel(projectType).toLowerCase()}…`}
            aria-label="Поиск по Modrinth"
          />
          {queryInput && (
            <button
              type="button"
              className="catalog-search-clear"
              onClick={() => {
                setQueryInput('');
                setQuery('');
              }}
              aria-label="Очистить поиск"
            >
              <X size={14} />
            </button>
          )}
          <span className="catalog-search-hint">/</span>
        </form>

        <div className="catalog-filters">
          <label className="select-field">
            <span>ВЕРСИЯ</span>
            <select value={gameVersion} onChange={(event) => setGameVersion(event.target.value)}>
              <option value="">ЛЮБАЯ</option>
              {versionManifest.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          {loaderRelevant && (
            <label className="select-field">
              <span>ЗАГРУЗЧИК</span>
              <select value={loader} onChange={(event) => setLoader(event.target.value)}>
                {loaderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="select-field">
            <span>КАТЕГОРИЯ</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">ВСЕ</option>
              {categories[projectType].map((item) => (
                <option key={item} value={item}>
                  {categoryTitles[item] || sanitizeCategory(item).toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="select-field select-field-sort">
            <span>СОРТИРОВКА</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SearchOptions['sort'])}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="icon-button catalog-refresh"
            title="Обновить результаты"
            onClick={() => void runSearch(false)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="catalog-results-meta">
        <span>
          <span className={cx('led', loading ? 'led-amber' : 'led-acid')} />
          {totalLabel}
          {activeInstance && (
            <>
              <em>· ЦЕЛЬ:</em> {instanceDisplayName(activeInstance).toUpperCase()}
            </>
          )}
        </span>
        <span className="catalog-results-source">MODRINTH API v2 / {projectTypeLabel(projectType)}</span>
      </div>

      {loading ? (
        <div className="project-grid" aria-busy="true">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="project-card project-card-skeleton" key={index}>
              <div className="skeleton-line skeleton-icon" />
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-text" />
              <div className="skeleton-line skeleton-text short" />
              <div className="skeleton-line skeleton-foot" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<RefreshCw size={38} />}
          title="MODRINTH НЕ ОТВЕЧАЕТ"
          description={`${error} Проверьте подключение к сети и попробуйте ещё раз.`}
          action={
            <button type="button" className="btn btn-primary" onClick={() => void runSearch(false)}>
              <RefreshCw size={14} /> ПОВТОРИТЬ
            </button>
          }
        />
      ) : hits.length === 0 ? (
        <EmptyState
          icon={<Search size={38} />}
          title="НИЧЕГО НЕ НАЙДЕНО"
          description="Попробуйте изменить запрос, версию игры или загрузчик — возможно, фильтры слишком строгие."
          action={
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setQueryInput('');
                setQuery('');
                setGameVersion('');
                setLoader('any');
                setCategory('');
              }}
            >
              СБРОСИТЬ ФИЛЬТРЫ
            </button>
          }
        />
      ) : (
        <>
          <div className="project-grid">
            {hits.map((hit) => {
              const installTarget = hit.project_type === 'modpack' ? null : activeInstance;
              return (
                <article
                  key={hit.project_id}
                  className="project-card"
                  onClick={() => onOpenProject(hit.project_id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenProject(hit.project_id);
                    }
                  }}
                >
                  <div className="project-card-head">
                    <span className="project-icon">
                      {hit.icon_url ? (
                        <img src={hit.icon_url} alt="" loading="lazy" />
                      ) : (
                        <Package size={26} />
                      )}
                    </span>
                    <div className="project-card-title">
                      <h3>{hit.title}</h3>
                      <span>BY {hit.author.toUpperCase()}</span>
                    </div>
                    <span className="project-card-downloads">
                      <Download size={12} /> {formatDownloads(hit.downloads)}
                    </span>
                  </div>

                  <p className="project-card-desc">{hit.description}</p>

                  <div className="project-card-tags">
                    {(hit.display_categories && hit.display_categories.length
                      ? hit.display_categories
                      : hit.categories
                    )
                      .slice(0, 3)
                      .map((tag) => (
                        <Tag key={tag} tone="muted">
                          {categoryTitles[tag] || sanitizeCategory(tag).toUpperCase()}
                        </Tag>
                      ))}
                    {hit.versions[0] && <Tag tone="default">{hit.versions[0]}</Tag>}
                  </div>

                  <div className="project-card-foot">
                    <span className="project-card-updated">
                      <Heart size={11} /> {formatDownloads(hit.follows)}
                      <em>·</em>
                      {relativeTime(hit.date_modified)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary project-install-btn"
                      disabled={installingId === hit.project_id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void quickInstall(hit);
                      }}
                      title={
                        installTarget || hit.project_type === 'modpack'
                          ? `Установить в ${hit.project_type === 'modpack' ? 'новую сборку' : instanceDisplayName(activeInstance)}`
                          : 'Сначала создайте сборку'
                      }
                    >
                      {installingId === hit.project_id ? (
                        <Loader2 size={12} className="spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      {hit.project_type === 'modpack' ? 'УСТАНОВИТЬ' : 'В СБОРКУ'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="catalog-more">
            <div className="catalog-more-info">
              ПОКАЗАНО {hits.length} ИЗ {formatDownloads(total)}
            </div>
            <div className="catalog-more-progress">
              <ProgressBar value={total ? Math.min(100, (hits.length / total) * 100) : 0} />
            </div>
            {hits.length < total ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={loadingMore}
                onClick={() => void runSearch(true)}
              >
                {loadingMore ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                ЗАГРУЗИТЬ ЕЩЁ
              </button>
            ) : (
              <span className="catalog-end">// КОНЕЦ ВЫДАЧИ</span>
            )}
          </div>
        </>
      )}

      <footer className="catalog-attribution">
        <div className="catalog-attribution-mark">MODRINTH</div>
        <p>
          Данные и загрузки предоставлены <strong>Modrinth API</strong>. Sunspire не связан с Modrinth,
          Mojang или Microsoft. Уважайте лицензии авторов проектов.
        </p>
        <button
          type="button"
          className="link-button"
          onClick={() => api.app.openExternal('https://modrinth.com')}
        >
          ОТКРЫТЬ MODRINTH <ExternalLink size={12} />
        </button>
      </footer>
    </div>
  );
};
