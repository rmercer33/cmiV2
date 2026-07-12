// Sidebar.tsx - cmiLibrary Dynamic Sidebar Navigation Tree
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, X, Book } from 'lucide-react';
import { buildReadLink } from './App';
import type { LibraryIndex, SourceInfo } from './types';

interface SidebarProps {
  libraryIndex: LibraryIndex | null;
  resolvedContext: {
    sectionId: string | undefined;
    sourceId: string | undefined;
    collectionId: string | undefined;
    bookId: string | undefined;
    groupId: string | undefined;
    unitId: string | undefined;
  };
  activeSourceConfig: SourceInfo | null;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

interface SidebarNodeProps {
  id: string;
  title: string;
  type: 'section' | 'source' | 'collection' | 'book' | 'group' | 'unit';
  pathParts: string[];
  accumulatedParts: {
    section?: string;
    source?: string;
    collection?: string;
    book?: string;
    group?: string;
    unit?: string;
  };
  nodeData: any;
  resolvedContext: any;
  activeSourceConfig: SourceInfo | null;
  expandedNodes: { [key: string]: boolean };
  setExpandedNodes: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
}

const SidebarNode: React.FC<SidebarNodeProps> = ({
  id,
  title,
  type,
  pathParts,
  accumulatedParts,
  nodeData,
  resolvedContext,
  activeSourceConfig,
  expandedNodes,
  setExpandedNodes,
}) => {
  const navigate = useNavigate();
  const currentPathKey = [...pathParts, id].join('/');
  const isExpanded = !!expandedNodes[currentPathKey];

  // Helper to determine if this node is active
  const isActive = (() => {
    switch (type) {
      case 'section': return resolvedContext.sectionId === id;
      case 'source': return resolvedContext.sourceId === id;
      case 'collection': return resolvedContext.collectionId === id;
      case 'book': return resolvedContext.bookId === id && resolvedContext.sourceId === accumulatedParts.source;
      case 'group': return resolvedContext.groupId === id && resolvedContext.bookId === accumulatedParts.book;
      case 'unit': return resolvedContext.unitId === id && (resolvedContext.groupId === id || resolvedContext.groupId === 'index' || resolvedContext.groupId === 'flat' || !resolvedContext.groupId || resolvedContext.groupId === accumulatedParts.group);
      default: return false;
    }
  })();

  const handleToggle = () => {
    if (type === 'unit') {
      navigate(buildReadLink({ ...accumulatedParts, unit: id }));
      return;
    }

    setExpandedNodes((prev) => {
      const isCurrentlyExpanded = !!prev[currentPathKey];
      const updated = { ...prev };
      if (isCurrentlyExpanded) {
        delete updated[currentPathKey];
      } else {
        // Solo Accordion toggle: close siblings of this same level
        const levelPrefix = pathParts.join('/');
        for (const k of Object.keys(updated)) {
          if (k.startsWith(levelPrefix) && k.split('/').length === currentPathKey.split('/').length) {
            delete updated[k];
          }
        }
        updated[currentPathKey] = true;
      }
      return updated;
    });

    // Navigate to landing page if applicable (Sections and Groups don't have HTML landing views)
    if (type === 'source' || type === 'collection' || type === 'book') {
      const parts = { ...accumulatedParts };
      if (type === 'source') parts.source = id;
      if (type === 'collection') parts.collection = id;
      if (type === 'book') parts.book = id;
      navigate(buildReadLink(parts));
    }
  };

  // Determine children to render recursively
  let children: string[] = [];
  let childType: 'source' | 'collection' | 'book' | 'group' | 'unit' | null = null;
  let getChildNodeData: (childId: string) => any = () => null;

  if (type === 'section') {
    children = nodeData.sources || [];
    childType = 'source';
    getChildNodeData = (childId) => nodeData.sourceInfo?.[childId];
  } else if (type === 'source') {
    if (isActive && activeSourceConfig) {
      if (activeSourceConfig.collections) {
        children = activeSourceConfig.collections;
        childType = 'collection';
        getChildNodeData = (childId) => activeSourceConfig.collectionInfo?.[childId];
      } else if (activeSourceConfig.books) {
        children = activeSourceConfig.books;
        childType = 'book';
        getChildNodeData = (childId) => activeSourceConfig.bookInfo?.[childId];
      }
    }
  } else if (type === 'collection') {
    children = nodeData.books || [];
    childType = 'book';
    getChildNodeData = (childId) => nodeData.bookInfo?.[childId];
  } else if (type === 'book') {
    if (nodeData.groups) {
      children = nodeData.groups;
      childType = 'group';
      getChildNodeData = (childId) => nodeData.groupInfo?.[childId];
    } else if (nodeData.units) {
      children = nodeData.units;
      childType = 'unit';
      getChildNodeData = (childId) => nodeData.unitInfo?.[childId];
    }
  } else if (type === 'group') {
    children = nodeData.units || [];
    childType = 'unit';
    getChildNodeData = (childId) => nodeData.unitInfo?.[childId];
  }

  // Unit (leaf) item
  if (type === 'unit') {
    // Legacy support for implicit "index" URL segment if the unit has a flat layout
    const finalAccumulated = { ...accumulatedParts, unit: id };
    if (!accumulatedParts.group && activeSourceConfig && resolvedContext.bookId) {
      const book = activeSourceConfig.bookInfo?.[resolvedContext.bookId];
      if (book && book.units && !book.groups) {
        finalAccumulated.group = 'index';
      }
    }
    const unitLink = buildReadLink(finalAccumulated);
    const isUnitActive = resolvedContext.unitId === id && resolvedContext.bookId === accumulatedParts.book;

    return (
      <Link
        to={unitLink}
        className={`unit-item ${isUnitActive ? 'active' : ''}`}
        style={{ paddingLeft: `${pathParts.length * 0.75 + 1.25}rem` }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
    );
  }

  // Container item (with collapsing button)
  return (
    <div className={`tree-node ${type}-node ${type}-item`}>
      <button
        className={`node-trigger ${type}-trigger ${isActive ? 'active' : ''}`}
        onClick={handleToggle}
        style={{ paddingLeft: `${pathParts.length * 0.75 + 0.5}rem` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
          {type === 'source' && <Book size={18} className="brand-icon" style={{ flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
        {children.length > 0 && (
          <ChevronRight
            size={16 - pathParts.length * 2}
            className={`node-chevron ${isExpanded ? 'expanded' : ''}`}
            style={{ flexShrink: 0 }}
          />
        )}
      </button>

      {/* Recurse child elements */}
      {isExpanded && children.length > 0 && (
        <div className={`node-children ${type}-children`} style={{ display: 'block', maxHeight: 'none' }}>
          {children.map((childId) => {
            const childData = getChildNodeData(childId);
            if (!childData) return null;

            const nextAccumulated = { ...accumulatedParts };
            if (type === 'section') nextAccumulated.source = childId;
            if (type === 'source' && childType === 'collection') nextAccumulated.collection = childId;
            if (type === 'source' && childType === 'book') nextAccumulated.book = childId;
            if (type === 'collection') nextAccumulated.book = childId;
            if (type === 'book') nextAccumulated.group = childId;

            return (
              <SidebarNode
                key={childId}
                id={childId}
                title={(childData as any).title}
                type={childType!}
                pathParts={[...pathParts, id]}
                accumulatedParts={nextAccumulated}
                nodeData={childData}
                resolvedContext={resolvedContext}
                activeSourceConfig={activeSourceConfig}
                expandedNodes={expandedNodes}
                setExpandedNodes={setExpandedNodes}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  libraryIndex,
  resolvedContext,
  activeSourceConfig,
  isCollapsed,
  setIsCollapsed,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<{ [key: string]: boolean }>({});

  // Solo Accordion auto-expansion on route/URL changes
  useEffect(() => {
    const newExpanded: { [key: string]: boolean } = {};
    const pathParts: string[] = [];

    if (resolvedContext.sectionId) {
      pathParts.push(resolvedContext.sectionId);
      newExpanded[pathParts.join('/')] = true;
    }
    if (resolvedContext.sourceId) {
      pathParts.push(resolvedContext.sourceId);
      newExpanded[pathParts.join('/')] = true;
    }
    if (resolvedContext.collectionId) {
      pathParts.push(resolvedContext.collectionId);
      newExpanded[pathParts.join('/')] = true;
    }
    if (resolvedContext.bookId) {
      pathParts.push(resolvedContext.bookId);
      newExpanded[pathParts.join('/')] = true;
    }
    if (resolvedContext.groupId && resolvedContext.groupId !== 'index' && resolvedContext.groupId !== 'flat') {
      pathParts.push(resolvedContext.groupId);
      newExpanded[pathParts.join('/')] = true;
    }

    setExpandedNodes(newExpanded);
  }, [
    resolvedContext.sectionId,
    resolvedContext.sourceId,
    resolvedContext.collectionId,
    resolvedContext.bookId,
    resolvedContext.groupId
  ]);

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

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <span>Library Contents</span>
        <button className="mobile-close-btn" style={{ display: 'none' }} onClick={() => setIsCollapsed(true)}>
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-tree">
        {libraryIndex.sections ? (
          // Render sectioned root
          libraryIndex.sections.map((sectionId) => {
            const sectionMeta = libraryIndex.sectionInfo?.[sectionId];
            if (!sectionMeta) return null;

            return (
              <SidebarNode
                key={sectionId}
                id={sectionId}
                title={sectionMeta.title}
                type="section"
                pathParts={[]}
                accumulatedParts={{ section: sectionId }}
                nodeData={sectionMeta}
                resolvedContext={resolvedContext}
                activeSourceConfig={activeSourceConfig}
                expandedNodes={expandedNodes}
                setExpandedNodes={setExpandedNodes}
              />
            );
          })
        ) : libraryIndex.sources ? (
          // Render flat, backward-compatible sources root
          libraryIndex.sources.map((sourceId) => {
            const sourceMeta = libraryIndex.sourceInfo?.[sourceId];
            if (!sourceMeta) return null;

            return (
              <SidebarNode
                key={sourceId}
                id={sourceId}
                title={sourceMeta.title}
                type="source"
                pathParts={[]}
                accumulatedParts={{ source: sourceId }}
                nodeData={sourceMeta}
                resolvedContext={resolvedContext}
                activeSourceConfig={activeSourceConfig}
                expandedNodes={expandedNodes}
                setExpandedNodes={setExpandedNodes}
              />
            );
          })
        ) : null}
      </div>
    </aside>
  );
};
