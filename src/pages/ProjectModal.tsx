import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileArchive,
  Gamepad2,
  Heart,
  Layers3,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  User,
  X
} from 'lucide-react';
import { ModrinthProject, ModrinthVersion } from '../types';
import { useLauncher } from '../state/LauncherContext';
import { api } from '../lib/api';
import {
  cx,
  formatDate,
  formatDownloads,
  instanceDisplayName,
  loaderLabel,
  projectTypeLabel,
  sanitizeCategory,
  truncateMiddle
} from '../lib/format';
import { BlockIcon } from '../components/ui/BlockIcon';
import { Modal, Tag } from '../components/ui/Common';

interface ProjectModalProps {
  projectId: string;
  onClose: () => void;
  onGoToInstances: () => void;
  onCreateInstance: () => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  projectId,
  onClose,
  onGoToInstances,
  onCreateInstance
}) => {
  const { state, activeInstance, installProject, installModpack } = useLauncher();
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(activeInstance?.id || '');
  const [versionId, setVersionId] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [imageBroken, setImageBroken] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api.modrinth
      .project(projectId)
      .then((result) => {
        setProject(result);
        setLoading(false);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    setGalleryIndex(0);
    setImageBroken(false);
    setInstalled(false);
    setVersionId('');
  }, [projectId]);

  const target = useMemo(
    () => state?.instances.find((instance) => instance.id === targetId) || null,
    [state?.instances, targetId]
  );

  const isModpack = project?.project_type === 'modpack';
  const needsTarget = !isModpack;

  const compatibleVersions = useMemo(() => {
    if (!project) return [];
    if (isModpack) return project.versions;
    return project.versions.filter((version) => {
      if (target) {
        if (!version.game_versions.includes(target.mcVersion)) return false;
        if (
          project.project_type === 'mod' &&
          target.loader !== 'vanilla' &&
          !version.loaders.includes(target.loader)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [project, target, isModpack]);

  const versionsToShow = compatibleVersions.length ? compatibleVersions : project?.versions || [];
  const selectedVersion = useMemo(
    () => versionsToShow.find((version) => version.id === versionId) || versionsToShow[0] || null,
    [versionsToShow, versionId]
  );

  useEffect(() => {
    if (!selectedVersion && versionsToShow.length) {
      setVersionId(versionsToShow[0].id);
    } else if (selectedVersion && selectedVersion.id !== versionId) {
      setVersionId(selectedVersion.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionsToShow.map((version) => version.id).join(','), targetId]);

  const gallery = project?.gallery || [];
  const currentImage = gallery[galleryIndex]?.url;
  const requiredDependencies =
    selectedVersion?.dependencies.filter((dep) => dep.dependency_type === 'required') || [];

  const handleInstall = async () => {
    if (!project || !selectedVersion || installing) return;
    if (needsTarget && !target) {
      onCreateInstance();
      return;
    }
    setInstalling(true);
    try {
      if (isModpack) {
        const ok = await installModpack(project.id, selectedVersion.id);
        if (ok) {
          onClose();
          onGoToInstances();
        }
      } else if (target) {
        const ok = await installProject(project.id, selectedVersion.id, target.id);
        if (ok) setInstalled(true);
      }
    } finally {
      setInstalling(false);
    }
  };

  const cycleGallery = (direction: number) => {
    if (!gallery.length) return;
    setGalleryIndex((current) => (current + direction + gallery.length) % gallery.length);
    setImageBroken(false);
  };

  return (
    <Modal
      title={project?.title || 'Проект Modrinth'}
      onClose={onClose}
      size="xl"
      className="project-modal"
      hideHeader
      kicker="MODRINTH :: PROJECT VIEW"
    >
      {loading ? (
        <div className="project-detail project-detail-loading">
          <div className="project-detail-main">
            <div className="skeleton-line skeleton-gallery" />
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-text" />
            <div className="skeleton-line skeleton-text" />
            <div className="skeleton-line skeleton-text short" />
          </div>
          <div className="project-detail-side">
            <div className="skeleton-line skeleton-side" />
            <div className="skeleton-line skeleton-side" />
            <div className="skeleton-line skeleton-side" />
          </div>
        </div>
      ) : error || !project ? (
        <div className="project-load-error">
          <AlertTriangle size={40} />
          <h2>НЕ УДАЛОСЬ ЗАГРУЗИТЬ ПРОЕКТ</h2>
          <p>{error || 'Modrinth не вернул данные проекта.'}</p>
          <div className="project-load-error-actions">
            <button type="button" className="btn btn-primary" onClick={load}>
              <RefreshCw size={14} /> ПОВТОРИТЬ
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              ЗАКРЫТЬ
            </button>
          </div>
        </div>
      ) : (
        <div className="project-detail">
          <div className="project-detail-main">
            <header className="project-hero">
              <span className="project-hero-icon">
                {project.icon_url ? (
                  <img src={project.icon_url} alt="" />
                ) : (
                  <Package size={40} />
                )}
              </span>
              <div className="project-hero-text">
                <span className="page-kicker">
                  MODRINTH / {projectTypeLabel(project.project_type)}
                </span>
                <h2>{project.title}</h2>
                <p>{project.description}</p>
                <div className="project-hero-meta">
                  <span>
                    <User size={12} /> {project.author}
                  </span>
                  <span>
                    <Download size={12} /> {formatDownloads(project.downloads)} загрузок
                  </span>
                  <span>
                    <Heart size={12} /> {formatDownloads(project.followers)}
                  </span>
                  <span>
                    <Calendar size={12} /> {formatDate(project.updated)}
                  </span>
                </div>
              </div>
              <div className="project-hero-actions">
                <button
                  type="button"
                  className="icon-button"
                  title="Открыть на Modrinth"
                  onClick={() => api.app.openExternal(`https://modrinth.com/${project.project_type}/${project.slug}`)}
                >
                  <ExternalLink size={15} />
                </button>
                <button type="button" className="icon-button" title="Закрыть" onClick={onClose}>
                  <X size={15} />
                </button>
              </div>
            </header>

            <div className="project-tags-row">
              <Tag tone="acid">{projectTypeLabel(project.project_type)}</Tag>
              {project.categories.slice(0, 5).map((category) => (
                <Tag tone="muted" key={category}>
                  {sanitizeCategory(category).toUpperCase()}
                </Tag>
              ))}
              {project.loaders.map((loader) => (
                <Tag tone="default" key={loader}>
                  {loader.toUpperCase()}
                </Tag>
              ))}
            </div>

            <section className="project-gallery-section">
              <div className="project-gallery">
                <div className="project-gallery-main">
                  {currentImage && !imageBroken ? (
                    <img
                      src={currentImage}
                      alt={gallery[galleryIndex]?.title || project.title}
                      loading="lazy"
                      onError={() => setImageBroken(true)}
                    />
                  ) : (
                    <div className="project-gallery-fallback">
                      <BlockIcon type="grass" size={82} />
                      <span>НЕТ ИЗОБРАЖЕНИЙ</span>
                    </div>
                  )}
                  {gallery.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="gallery-arrow gallery-arrow-prev"
                        onClick={() => cycleGallery(-1)}
                        aria-label="Предыдущее изображение"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        className="gallery-arrow gallery-arrow-next"
                        onClick={() => cycleGallery(1)}
                        aria-label="Следующее изображение"
                      >
                        <ChevronRight size={18} />
                      </button>
                      <span className="gallery-counter">
                        {String(galleryIndex + 1).padStart(2, '0')} / {String(gallery.length).padStart(2, '0')}
                      </span>
                    </>
                  )}
                </div>
                {gallery.length > 1 && (
                  <div className="project-gallery-thumbs">
                    {gallery.map((image, index) => (
                      <button
                        key={`${image.url}-${index}`}
                        type="button"
                        className={cx('gallery-thumb', galleryIndex === index && 'is-active')}
                        onClick={() => {
                          setGalleryIndex(index);
                          setImageBroken(false);
                        }}
                      >
                        <img src={image.url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="project-description markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(event) => {
                        event.preventDefault();
                        if (href) void api.app.openExternal(href);
                      }}
                    >
                      {children}
                    </a>
                  )
                }}
              >
                {project.body || project.description}
              </ReactMarkdown>
            </div>

            <div className="project-meta-grid">
              <div>
                <span>ЛИЦЕНЗИЯ</span>
                <strong>{project.license?.name || 'Не указана'}</strong>
              </div>
              <div>
                <span>ВЕРСИИ ИГРЫ</span>
                <strong>
                  {project.game_versions.slice(0, 4).join(', ')}
                  {project.game_versions.length > 4 ? '…' : ''}
                </strong>
              </div>
              <div>
                <span>ЗАГРУЗЧИКИ</span>
                <strong>{project.loaders.join(', ') || '—'}</strong>
              </div>
              <div>
                <span>ОБНОВЛЕН</span>
                <strong>{formatDate(project.updated)}</strong>
              </div>
            </div>

            <div className="project-links">
              {project.source_url && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.app.openExternal(project.source_url!)}>
                  <ExternalLink size={12} /> ИСХОДНЫЙ КОД
                </button>
              )}
              {project.issues_url && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.app.openExternal(project.issues_url!)}>
                  <ExternalLink size={12} /> ПРОБЛЕМЫ
                </button>
              )}
              {project.discord_url && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.app.openExternal(project.discord_url!)}>
                  <ExternalLink size={12} /> DISCORD
                </button>
              )}
            </div>
          </div>

          <aside className="project-detail-side">
            <div className="install-panel">
              <div className="install-panel-head">
                <span className="page-kicker">// INSTALL BAY</span>
                <span className="install-panel-type">
                  {isModpack ? <FileArchive size={14} /> : <Package size={14} />}
                </span>
              </div>

              {needsTarget && (
                <label className="field install-field">
                  <span className="field-label">ЦЕЛЕВАЯ СБОРКА</span>
                  {state && state.instances.length > 0 ? (
                    <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                      {state.instances.map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          {instanceDisplayName(instance)} · {instance.mcVersion} · {loaderLabel(instance.loader)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button type="button" className="install-no-instance" onClick={onCreateInstance}>
                      <Layers3 size={16} />
                      <span>
                        <strong>СБОРКИ НЕ НАЙДЕНЫ</strong>
                        <em>Создайте сборку, чтобы устанавливать проекты</em>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </label>
              )}

              {target && needsTarget && (
                <div className="install-target-card">
                  <BlockIcon type={target.icon} size={30} />
                  <div>
                    <strong>{instanceDisplayName(target)}</strong>
                    <span>
                      {target.mcVersion} · {loaderLabel(target.loader)} ·{' '}
                      {target.mods.length} файлов
                    </span>
                  </div>
                  <span className="led led-acid" />
                </div>
              )}

              <label className="field install-field">
                <span className="field-label">
                  ВЕРСИЯ ПРОЕКТА <em>{versionsToShow.length}</em>
                </span>
                {versionsToShow.length > 0 ? (
                  <select value={selectedVersion?.id || ''} onChange={(event) => setVersionId(event.target.value)}>
                    {versionsToShow.map((version) => (
                      <option key={version.id} value={version.id}>
                        {truncateMiddle(version.version_number, 34)} · {version.game_versions.slice(0, 2).join(', ')}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="install-warning">
                    <AlertTriangle size={13} /> У проекта нет доступных версий.
                  </div>
                )}
              </label>

              {selectedVersion && (
                <div className="install-version-info">
                  <div className="install-version-name">{selectedVersion.name}</div>
                  <div className="install-version-chips">
                    {selectedVersion.game_versions.slice(0, 3).map((version) => (
                      <Tag tone="default" key={version}>
                        {version}
                      </Tag>
                    ))}
                    {selectedVersion.loaders.slice(0, 2).map((loader) => (
                      <Tag tone="muted" key={loader}>
                        {loader.toUpperCase()}
                      </Tag>
                    ))}
                  </div>
                  <div className="install-version-meta">
                    <span>
                      <Download size={11} /> {formatDownloads(selectedVersion.downloads)}
                    </span>
                    <span>
                      <Calendar size={11} /> {formatDate(selectedVersion.date_published)}
                    </span>
                  </div>
                  {requiredDependencies.length > 0 && (
                    <div className="install-dependencies">
                      <ShieldCheck size={13} />
                      <span>
                        Будет установлено зависимостей: <strong>{requiredDependencies.length}</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {needsTarget && target && compatibleVersions.length === 0 && project.versions.length > 0 && (
                <div className="install-warning">
                  <AlertTriangle size={13} />
                  Нет версий, совместимых с {target.mcVersion} / {loaderLabel(target.loader)}. Показаны все
                  версии проекта.
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary install-button"
                onClick={() => void handleInstall()}
                disabled={installing || !selectedVersion || (needsTarget && !target)}
              >
                {installing ? (
                  <Loader2 size={16} className="spin" />
                ) : installed ? (
                  <Check size={16} />
                ) : (
                  <Download size={16} />
                )}
                {installing
                  ? 'УСТАНОВКА…'
                  : installed
                    ? 'УСТАНОВЛЕНО'
                    : isModpack
                      ? 'СОЗДАТЬ СБОРКУ'
                      : 'УСТАНОВИТЬ В СБОРКУ'}
              </button>

              {installed && (
                <div className="install-success">
                  <Check size={13} /> Проект и зависимости добавлены в сборку.
                </div>
              )}

              <p className="install-note">
                {isModpack
                  ? 'Modrinth-модпак будет установлен как новая сборка со своим загрузчиком и файлами.'
                  : 'Файл будет скачан с CDN Modrinth. Обязательные зависимости устанавливаются автоматически.'}
              </p>

              <div className="install-attribution">
                <span>POWERED BY</span>
                <button type="button" onClick={() => api.app.openExternal('https://modrinth.com')}>
                  MODRINTH
                </button>
              </div>
            </div>

            <div className="project-side-facts">
              <div>
                <span>ТИП</span>
                <strong>{projectTypeLabel(project.project_type)}</strong>
              </div>
              <div>
                <span>СЛУГ</span>
                <strong>{project.slug}</strong>
              </div>
              <div>
                <span>ОПУБЛИКОВАН</span>
                <strong>{formatDate(project.published)}</strong>
              </div>
              <div>
                <span>ВСЕГО ВЕРСИЙ</span>
                <strong>{project.versions.length}</strong>
              </div>
            </div>

            <button type="button" className="btn btn-ghost project-side-back" onClick={onClose}>
              <ArrowLeft size={14} /> НАЗАД В КАТАЛОГ
            </button>
          </aside>
        </div>
      )}
    </Modal>
  );
};
