// App.tsx - cmiLibrary SPA Shell and State Coordinator
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useParams, Link } from 'react-router-dom';
import { Menu, Settings } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Reader } from './Reader';
import type { LibraryIndex, SourceInfo } from './types';

// Child component that resides inside the BrowserRouter context, allowing hooks to function
const AppContent: React.FC = () => {
  const { sourceId, bookId, groupId, unitId } = useParams<{
    sourceId?: string;
    bookId?: string;
    groupId?: string;
    unitId?: string;
  }>();

  const [libraryIndex, setLibraryIndex] = useState<LibraryIndex | null>(null);
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

  // 1. Fetch lightweight index.json on initial app mount
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

    // Load initial theme from localStorage if saved
    const savedTheme = localStorage.getItem('cmi-theme') || 'light';
    setTheme(savedTheme);
  }, []);

  // 2. Fetch full source configuration on-demand when active sourceId changes
  useEffect(() => {
    if (!sourceId) {
      setActiveSourceConfig(null);
      return;
    }

    // Only load if it's different from the already active config
    if (activeSourceConfig && sourceId === sourceId) {
      // In TS, sourceId from useParams is a string. If it matches current, skip fetch.
    }

    fetch(`/config/${sourceId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load config for source: ${sourceId}`);
        return res.json();
      })
      .then((data: SourceInfo) => {
        setActiveSourceConfig(data);
      })
      .catch((err) => {
        console.error(`Error loading source config (${sourceId}):`, err);
        setActiveSourceConfig(null);
      });
  }, [sourceId]);

  // 3. Reflect theme state changes to document DOM root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cmi-theme', theme);
  }, [theme]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // Resolve active structures in a type-safe manner for headers/breadcrumbs lookup
  const activeBook = bookId && activeSourceConfig ? activeSourceConfig.bookInfo[bookId] : null;
  const activeGroup = activeBook && groupId && activeBook.groupInfo ? activeBook.groupInfo[groupId] : null;
  const activeUnit = activeBook && unitId 
    ? (groupId === 'index' || groupId === 'flat' 
        ? activeBook.unitInfo?.[unitId] 
        : activeGroup?.unitInfo?.[unitId])
    : null;

  // 4. Update HTML Document Title contextually
  useEffect(() => {
    let newTitle = 'cmiLibrary';
    if (activeUnit) {
      if (activeUnit.pageTitle) {
        newTitle = activeUnit.pageTitle;
      } else {
        const fallbackContext = activeBook?.pageTitle || activeBook?.title || activeSourceConfig?.pageTitle || activeSourceConfig?.title || 'cmiLibrary';
        newTitle = `${activeUnit.title} | ${fallbackContext}`;
      }
    } else if (activeBook) {
      newTitle = activeBook.pageTitle || activeBook.title || 'cmiLibrary';
    } else if (activeSourceConfig) {
      newTitle = activeSourceConfig.pageTitle || activeSourceConfig.title || 'cmiLibrary';
    }
    document.title = newTitle;
  }, [activeSourceConfig, activeBook, activeUnit]);

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
              <img src="/cmi-logo.svg" className="brand-logo" alt="" style={{ height: '32px', width: 'auto', display: 'block' }} />
              <span>Library of Christ Mind Teachings</span>
            </Link>
          </div>

          {isSidebarCollapsed && sourceId && activeSourceConfig && (
            <div className="header-breadcrumbs-stacked">
              <div className="crumb-line-source">
                {activeSourceConfig.title}
              </div>
              <div className="crumb-line-path">
                {activeBook && (
                  <span className="crumb-book">{activeBook.title}</span>
                )}
                {activeGroup && groupId !== 'index' && groupId !== 'flat' && (
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
          activeSourceId={sourceId}
          activeBookId={bookId}
          activeGroupId={groupId}
          activeUnitId={unitId}
          activeSourceConfig={activeSourceConfig}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
        />

        {/* Immersive Reader display */}
        <Reader
          activeSourceId={sourceId}
          activeBookId={bookId}
          activeGroupId={groupId}
          activeUnitId={unitId}
          activeSourceConfig={activeSourceConfig}
          libraryIndex={libraryIndex}
          isSidebarCollapsed={isSidebarCollapsed}
          showIds={showIds}
        />
      </div>
    </div>
  );
};

// Route wrapper that maps both the root index page and nested content routes
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/read/:sourceId" element={<AppContent />} />
        <Route path="/read/:sourceId/:bookId" element={<AppContent />} />
        <Route path="/read/:sourceId/:bookId/:groupId/:unitId" element={<AppContent />} />
        {/* Fallback routing */}
        <Route path="*" element={<AppContent />} />
      </Routes>
    </BrowserRouter>
  );
}
