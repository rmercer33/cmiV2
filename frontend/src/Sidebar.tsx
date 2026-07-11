// Sidebar.tsx - cmiLibrary Dynamic Sidebar Navigation Tree
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, X, Book } from 'lucide-react';
import type { LibraryIndex, SourceInfo } from './types';

interface SidebarProps {
  libraryIndex: LibraryIndex | null;
  activeSourceId: string | undefined;
  activeBookId: string | undefined;
  activeGroupId: string | undefined;
  activeUnitId: string | undefined;
  activeSourceConfig: SourceInfo | null;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  libraryIndex,
  activeSourceId,
  activeBookId,
  activeGroupId,
  activeUnitId,
  activeSourceConfig,
  isCollapsed,
  setIsCollapsed,
}) => {
  const navigate = useNavigate();
  const [expandedSources, setExpandedSources] = useState<{ [key: string]: boolean }>({});
  const [expandedBooks, setExpandedBooks] = useState<{ [key: string]: boolean }>({});
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({});

  // Auto-expand active source, book, and group when route changes, and collapse others (Solo Accordion)
  useEffect(() => {
    if (activeSourceId) {
      setExpandedSources({ [activeSourceId]: true });
    } else {
      setExpandedSources({});
    }

    if (activeBookId) {
      setExpandedBooks({ [activeBookId]: true });
    } else {
      setExpandedBooks({});
    }

    if (activeGroupId) {
      setExpandedGroups({ [activeGroupId]: true });
    } else {
      setExpandedGroups({});
    }
  }, [activeSourceId, activeBookId, activeGroupId]);

  if (!libraryIndex) {
    return (
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="loader-container">
          <div className="spinner"></div>
          <span>Loading index...</span>
        </div>
      </aside>
    );
  }

  const toggleSource = (sourceId: string) => {
    const isSourceActive = activeSourceId === sourceId;
    const isAtLandingPage = isSourceActive && !activeBookId;
    const isCurrentlyExpanded = !!expandedSources[sourceId];

    if (isSourceActive) {
      if (isAtLandingPage) {
        // If we are already on the landing page of this source, toggle the accordion open/closed
        if (isCurrentlyExpanded) {
          setExpandedSources({});
        } else {
          setExpandedSources({ [sourceId]: true });
        }
      } else {
        // If we are currently reading a unit, clicking the active source header returns us to its landing page
        navigate(`/read/${sourceId}`);
      }
    } else {
      // If we click an inactive source, automatically expand only it and collapse other sources
      setExpandedSources({ [sourceId]: true });
      navigate(`/read/${sourceId}`);
    }
  };

  const toggleBook = (bookId: string) => {
    const isBookActive = activeBookId === bookId;
    const isAtBookLanding = isBookActive && !activeGroupId;
    const isCurrentlyExpanded = !!expandedBooks[bookId];

    if (isBookActive) {
      if (isAtBookLanding) {
        // Toggle collapse
        if (isCurrentlyExpanded) {
          setExpandedBooks({});
        } else {
          setExpandedBooks({ [bookId]: true });
        }
      } else {
        // Return to book landing page
        navigate(`/read/${activeSourceId}/${bookId}`);
      }
    } else {
      // Expand and navigate to book landing page
      setExpandedBooks({ [bookId]: true });
      navigate(`/read/${activeSourceId}/${bookId}`);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const isCurrentlyExpanded = !!prev[groupId];
      return isCurrentlyExpanded ? {} : { [groupId]: true };
    });
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <span>Library Contents</span>
        <button className="mobile-close-btn" style={{ display: 'none' }} onClick={() => setIsCollapsed(true)}>
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-tree">
        {libraryIndex.sources.map((sourceId) => {
          const sourceMeta = libraryIndex.sourceInfo[sourceId];
          if (!sourceMeta) return null;

          const isSourceExpanded = !!expandedSources[sourceId];
          const isSourceActive = activeSourceId === sourceId;

          return (
            <div key={sourceId} className="tree-node source-node">
              <button 
                className={`node-trigger source-trigger ${isSourceActive ? 'active' : ''}`}
                onClick={() => toggleSource(sourceId)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Book size={18} className="brand-icon" />
                  <span>{sourceMeta.title}</span>
                </div>
                <ChevronRight 
                  size={16} 
                  className={`node-chevron ${isSourceExpanded ? 'expanded' : ''}`} 
                />
              </button>

              {/* Collapsible Source Content */}
              {isSourceExpanded && (
                <div className="node-children source-children" style={{ maxHeight: 'none', display: 'block' }}>
                  {isSourceActive && activeSourceConfig ? (
                    // Render fully loaded nested tree for the active source
                    activeSourceConfig.books.map((bookId) => {
                      const bookMeta = activeSourceConfig.bookInfo[bookId];
                      if (!bookMeta) return null;

                      const isBookExpanded = !!expandedBooks[bookId];
                      const isBookActive = activeBookId === bookId;

                      return (
                        <div key={bookId} className="tree-node book-node book-item">
                          <button 
                            className={`node-trigger book-trigger ${isBookActive ? 'active' : ''}`}
                            onClick={() => toggleBook(bookId)}
                          >
                            <span>{bookMeta.title}</span>
                            <ChevronRight 
                              size={14} 
                              className={`node-chevron ${isBookExpanded ? 'expanded' : ''}`} 
                            />
                          </button>

                          {/* Collapsible Book Content */}
                          {isBookExpanded && (
                            <div className="node-children book-children" style={{ maxHeight: 'none', display: 'block' }}>
                              {bookMeta.groups ? (
                                // Grouped Book Layout (e.g. Text with Chapters)
                                bookMeta.groups.map((groupId) => {
                                  const groupMeta = bookMeta.groupInfo?.[groupId];
                                  if (!groupMeta) return null;

                                  const isGroupExpanded = !!expandedGroups[groupId];
                                  const isGroupActive = activeGroupId === groupId;

                                  return (
                                    <div key={groupId} className="tree-node group-node group-item">
                                      <button 
                                        className={`node-trigger group-trigger ${isGroupActive ? 'active' : ''}`}
                                        onClick={() => toggleGroup(groupId)}
                                        style={{ fontSize: '0.9rem', fontWeight: 500 }}
                                      >
                                        <span>{groupMeta.title}</span>
                                        <ChevronRight 
                                          size={12} 
                                          className={`node-chevron ${isGroupExpanded ? 'expanded' : ''}`} 
                                        />
                                      </button>

                                      {/* Collapsible Group Content (Units) */}
                                      {isGroupExpanded && (
                                        <div className="node-children group-children" style={{ maxHeight: 'none', display: 'block' }}>
                                          {groupMeta.units.map((unitId) => {
                                            const unitMeta = groupMeta.unitInfo[unitId];
                                            if (!unitMeta) return null;

                                            const isUnitActive = activeUnitId === unitId && isGroupActive && isBookActive;

                                            return (
                                              <Link
                                                key={unitId}
                                                to={`/read/${sourceId}/${bookId}/${groupId}/${unitId}`}
                                                className={`unit-item ${isUnitActive ? 'active' : ''}`}
                                                dangerouslySetInnerHTML={{ __html: unitMeta.title }}
                                              />
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              ) : bookMeta.units ? (
                                // Flat Book Layout (e.g. Workbook / Manual with Lessons directly)
                                bookMeta.units.map((unitId) => {
                                  const unitMeta = bookMeta.unitInfo?.[unitId];
                                  if (!unitMeta) return null;

                                  const isUnitActive = activeUnitId === unitId && isBookActive && activeGroupId === 'index';

                                  return (
                                    <Link
                                      key={unitId}
                                      to={`/read/${sourceId}/${bookId}/index/${unitId}`}
                                      className={`unit-item ${isUnitActive ? 'active' : ''}`}
                                      style={{ paddingLeft: '1.5rem' }} // Shift left because there is no intermediate level
                                      dangerouslySetInnerHTML={{ __html: unitMeta.title }}
                                    />
                                  );
                                })
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    // Light placeholder while loading the full source config
                    <div style={{ padding: '0.75rem 1.5rem', color: varColor('--text-secondary'), fontSize: '0.85rem' }}>
                      {isSourceActive ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid var(--border-color)', borderTopColor: 'var(--accent-color)' }}></div>
                          <span>Loading books...</span>
                        </div>
                      ) : (
                        <button 
                          onClick={() => navigate(`/read/${sourceId}`)}
                          style={{ color: 'var(--accent-color)', textDecoration: 'underline', width: '100%', textAlign: 'left' }}
                        >
                          Open teachings
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

// Simple helper to safely get var values or fallback in JSX
function varColor(variableName: string) {
  return `var(${variableName})`;
}
