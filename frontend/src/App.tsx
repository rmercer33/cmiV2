// App.tsx - cmiLibrary SPA Shell and State Coordinator
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Menu, Settings } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Reader } from './Reader';
import type { LibraryIndex, SourceInfo, SiteInfo } from './types';

// Helper to construct URLs dynamically for any layout depth
export function buildReadLink(parts: {
  section?: string;
  source?: string;
  collection?: string;
  book?: string;
  group?: string;
  unit?: string;
}) {
  const segments = [];
  if (parts.section) segments.push(parts.section);
  if (parts.source) segments.push(parts.source);
  if (parts.collection) segments.push(parts.collection);
  if (parts.book) segments.push(parts.book);
  if (parts.group && parts.group !== 'index' && parts.group !== 'flat') segments.push(parts.group);
  if (parts.unit) segments.push(parts.unit);
  return `/read/${segments.join('/')}`;
}

// Child component that resides inside the BrowserRouter context, allowing hooks to function
const AppContent: React.FC = () => {
  const location = useLocation();
  const segments = location.pathname.split('/').filter((s) => s && s !== 'read');

  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [activeSourceConfig, setActiveSourceConfig] = useState<SourceInfo | null>(null);
  const [theme, setTheme] = useState<string>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [showIds, setShowIds] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings dropdown on outside clicks
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Fetch lightweight index.json and site info on initial app mount
  useEffect(() => {
    fetch('/config/index.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load global library index.');
        return res.json();
      })
      .then((data: LibraryIndex) => {
        setLibraryIndex(data);
      })
      .catch((err) => {
        console.error('App Load Error:', err);
      });

    fetch('/info.json')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data: SiteInfo | null) => {
        if (data) setSiteInfo(data);
      })
      .catch((err) => {
        console.error('Failed to load site info.json, using defaults:', err);
      });

    // Load initial theme from localStorage if saved
    const savedTheme = localStorage.getItem('cmi-theme') || 'light';
    setTheme(savedTheme);
  }, []);

  // Central Path Resolver: computed dynamically on render based on current URL path segments
  let resolvedSectionId: string | undefined = undefined;
  let resolvedSourceId: string | undefined = undefined;
  let resolvedCollectionId: string | undefined = undefined;
  let resolvedBookId: string | undefined = undefined;
  let resolvedGroupId: string | undefined = undefined;
  let resolvedUnitId: string | undefined = undefined;

  if (libraryIndex && segments.length > 0) {
    let segmentIndex = 0;
    const firstSegment = segments[segmentIndex];

    // Determine if first segment is a Section or Source
    if (libraryIndex.sections && libraryIndex.sections.includes(firstSegment)) {
      resolvedSectionId = firstSegment;
      segmentIndex++;
      if (segmentIndex < segments.length) {
        resolvedSourceId = segments[segmentIndex];
        segmentIndex++;
      }
    } else if (libraryIndex.sources && libraryIndex.sources.includes(firstSegment)) {
      resolvedSourceId = firstSegment;
      segmentIndex++;
    }

    // Determine collections, books, groups, and units if source is resolved and config is loaded
    if (resolvedSourceId && activeSourceConfig) {
      if (segmentIndex < segments.length) {
        const nextSegment = segments[segmentIndex];

        if (activeSourceConfig.collections && activeSourceConfig.collections.includes(nextSegment)) {
          resolvedCollectionId = nextSegment;
          segmentIndex++;
          if (segmentIndex < segments.length) {
            resolvedBookId = segments[segmentIndex];
            segmentIndex++;
          }
        } else if (activeSourceConfig.books && activeSourceConfig.books.includes(nextSegment)) {
          resolvedBookId = nextSegment;
          segmentIndex++;
        }
      }

      if (resolvedBookId) {
        const bookMeta = activeSourceConfig.bookInfo?.[resolvedBookId];
        if (bookMeta) {
          if (segmentIndex < segments.length) {
            const nextSegment = segments[segmentIndex];

            if (bookMeta.groups && bookMeta.groups.includes(nextSegment)) {
              resolvedGroupId = nextSegment;
              segmentIndex++;
              if (segmentIndex < segments.length) {
                resolvedUnitId = segments[segmentIndex];
              }
            } else if (bookMeta.units && bookMeta.units.includes(nextSegment)) {
              resolvedUnitId = nextSegment;
            } else {
              // Backward compatibility check for implicit "index" or "flat" groups
              if (nextSegment === 'index' || nextSegment === 'flat') {
                resolvedGroupId = nextSegment;
                segmentIndex++;
                if (segmentIndex < segments.length) {
                  resolvedUnitId = segments[segmentIndex];
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Fetch full source configuration on-demand when resolvedSourceId changes
  useEffect(() => {
    if (!resolvedSourceId) {
      setActiveSourceConfig(null);
      return;
    }

    fetch(`/config/${resolvedSourceId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load config for source: ${resolvedSourceId}`);
        return res.json();
      })
      .then((data: SourceInfo) => {
        setActiveSourceConfig(data);
      })
      .catch((err) => {
        console.error(`Error loading source config (${resolvedSourceId}):`, err);
        setActiveSourceConfig(null);
      });
  }, [resolvedSourceId]);

  // 3. Reflect theme state changes to document DOM root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cmi-theme', theme);
  }, [theme]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Centralized Breadcrumb, Title & Media definitions
  const activeBook = resolvedBookId && activeSourceConfig
    ? (resolvedCollectionId && activeSourceConfig.collectionInfo
        ? activeSourceConfig.collectionInfo[resolvedCollectionId]?.bookInfo[resolvedBookId]
        : activeSourceConfig.bookInfo?.[resolvedBookId])
    : null;

  const activeGroup = activeBook && resolvedGroupId && activeBook.groupInfo
    ? activeBook.groupInfo[resolvedGroupId]
    : null;

  const activeUnit = activeBook && resolvedUnitId
    ? (resolvedGroupId === 'index' || resolvedGroupId === 'flat' || !resolvedGroupId
        ? activeBook.unitInfo?.[resolvedUnitId]
        : activeGroup?.unitInfo?.[resolvedUnitId])
    : null;

  // Compute clean S3/local media suffix dynamically starting from collection or book folder down to audio file
  const audioParts: string[] = [];
  if (resolvedCollectionId) audioParts.push(resolvedCollectionId);
  if (resolvedBookId) audioParts.push(resolvedBookId);
  if (resolvedGroupId && resolvedGroupId !== 'index' && resolvedGroupId !== 'flat') {
    audioParts.push(resolvedGroupId);
  }
  const audioFileName = activeUnit?.audiofn || resolvedUnitId;
  if (audioFileName) audioParts.push(audioFileName);

  const s3PathSuffix = audioParts.join('/');

  // Create clean ResolvedContext wrapper prop for downstream child views
  const resolvedContext = {
    sectionId: resolvedSectionId,
    sourceId: resolvedSourceId,
    collectionId: resolvedCollectionId,
    bookId: resolvedBookId,
    groupId: resolvedGroupId,
    unitId: resolvedUnitId,
    activeBook,
    activeGroup,
    activeUnit,
    s3PathSuffix
  };

  // 4. Handle dynamic browser tab document.title setting
  useEffect(() => {
    const siteTitle = siteInfo?.title || 'cmiLibrary';
    let newTitle = siteTitle;
    if (activeUnit) {
      if (activeUnit.pageTitle) {
        newTitle = activeUnit.pageTitle;
      } else {
        const fallbackContext = activeBook?.pageTitle || activeBook?.title || activeSourceConfig?.pageTitle || activeSourceConfig?.title || siteTitle;
        newTitle = `${activeUnit.title} | ${fallbackContext}`;
      }
    } else if (activeBook) {
      newTitle = activeBook.pageTitle || activeBook.title || siteTitle;
    } else if (activeSourceConfig) {
      newTitle = activeSourceConfig.pageTitle || activeSourceConfig.title || siteTitle;
    }
    document.title = newTitle;
  }, [activeSourceConfig, activeBook, activeUnit, siteInfo]);

  return (
    <div className="app-shell">
      {/* 1. Global App Header */}
      <header className="app-header">
        <div className="header-identity-wrapper">
          <div className="brand">
            <button className="sidebar-menu-btn" onClick={toggleSidebar} style={{marginRight: '0.5rem'}}>
              <Menu size={20} />
            </button>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}>
              <img src={siteInfo?.logo || "/cmi-logo.svg"} className="brand-logo" alt="" style={{ height: '32px', width: 'auto', display: 'block' }} />
              <span>{siteInfo?.title || "Library of Christ Mind Teachings"}</span>
            </Link>
          </div>

          {isSidebarCollapsed && resolvedSourceId && activeSourceConfig && (
            <div className="header-breadcrumbs-stacked">
              <div className="crumb-line-source">
                {activeSourceConfig.title}
              </div>
              <div className="crumb-line-path">
                {activeBook && (
                  <span className="crumb-book">{activeBook.title}</span>
                )}
                {activeGroup && resolvedGroupId !== 'index' && resolvedGroupId !== 'flat' && (
                  <>
                    <span className="crumb-separator">›</span>
                    <span className="crumb-group">{activeGroup.title}</span>
                  </>
                )}
                {activeUnit && (
                  <>
                    <span className="crumb-separator">›</span>
                    <span 
                      className="crumb-unit"
                      dangerouslySetInnerHTML={{ __html: activeUnit.title }}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="header-controls" ref={settingsRef}>
          <div className="settings-dropdown-container">
            <button 
              className="settings-menu-btn" 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="Settings"
            >
              <Settings size={20} />
            </button>

            {isSettingsOpen && (
              <div className="settings-dropdown">
                <div className="settings-group">
                  <label>Theme</label>
                  <select 
                    className="theme-select-inline" 
                    value={theme} 
                    onChange={(e) => {
                      setTheme(e.target.value);
                      localStorage.setItem('cmi-theme', e.target.value);
                    }}
                  >
                    <option value="light">Warm Parchment (Light)</option>
                    <option value="dark">Midnight Slate (Dark)</option>
                    <option value="sepia">Warm Sepia</option>
                  </select>
                </div>
                <div className="settings-group toggle-group">
                  <label htmlFor="show-ids-toggle">Show Paragraph IDs</label>
                  <input 
                    type="checkbox" 
                    id="show-ids-toggle" 
                    checked={showIds} 
                    onChange={(e) => setShowIds(e.target.checked)} 
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Responsive Main Layout */}
      <div className="main-container">
        {/* Dynamic Sidebar menu */}
        <Sidebar
          libraryIndex={libraryIndex}
          resolvedContext={resolvedContext}
          activeSourceConfig={activeSourceConfig}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
        />

        {/* Immersive Reader display */}
        <Reader
          resolvedContext={resolvedContext}
          activeSourceConfig={activeSourceConfig}
          libraryIndex={libraryIndex}
          isSidebarCollapsed={isSidebarCollapsed}
          showIds={showIds}
          siteInfo={siteInfo}
        />
      </div>
    </div>
  );
};

// Catch-all URL routing configuration matching arbitrary depth levels
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/read/*" element={<AppContent />} />
        {/* Fallback routing */}
        <Route path="*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
