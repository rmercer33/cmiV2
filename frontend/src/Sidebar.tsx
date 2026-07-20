// Sidebar.tsx - cmiLibrary Dynamic Sidebar Navigation Tree
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, X, Book, Folder, Layers, BookOpen } from 'lucide-react';
import { buildReadLink } from './App';
import type { LibraryIndex, SourceInfo, UnitInfo } from './types';
import { formatUnitTitle } from './utils';

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

interface ChildNode {
  id: string;
  type: 'source' | 'collection' | 'book' | 'group' | 'unit';
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

    if (type === 'group') {
      setTimeout(() => {
        const element = document.getElementById(`group-${id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  // Determine children to render recursively (generalised as { id, type } to support mixtures of node types)
  let children: ChildNode[] = [];
  let getChildNodeData: (childId: string, childType: string) => any = () => null;

  if (type === 'section') {
    children = (nodeData.sources || []).map((childId: string) => ({ id: childId, type: 'source' }));
    getChildNodeData = (childId) => nodeData.sourceInfo?.[childId];
  } else if (type === 'source') {
    if (isActive && activeSourceConfig) {
      const colls: ChildNode[] = (activeSourceConfig.collections || []).map((childId: string) => ({ id: childId, type: 'collection' }));
      const bks: ChildNode[] = (activeSourceConfig.books || []).map((childId: string) => ({ id: childId, type: 'book' }));
      children = [...colls, ...bks];
      getChildNodeData = (childId, childType) => {
        return childType === 'collection'
          ? activeSourceConfig.collectionInfo?.[childId]
          : activeSourceConfig.bookInfo?.[childId];
      };
    }
  } else if (type === 'collection') {
    children = (nodeData.books || []).map((childId: string) => ({ id: childId, type: 'book' }));
    getChildNodeData = (childId) => nodeData.bookInfo?.[childId];
  } else if (type === 'book') {
    const grps: ChildNode[] = (nodeData.groups || []).map((childId: string) => ({ id: childId, type: 'group' }));
    const unts: ChildNode[] = (nodeData.units || []).map((childId: string) => ({ id: childId, type: 'unit' }));
    children = [...grps, ...unts];
    getChildNodeData = (childId, childType) => {
      return childType === 'group'
        ? nodeData.groupInfo?.[childId]
        : nodeData.unitInfo?.[childId];
    };
  } else if (type === 'group') {
    children = (nodeData.units || []).map((childId: string) => ({ id: childId, type: 'unit' }));
    getChildNodeData = (childId) => nodeData.unitInfo?.[childId];
  }

  // Unit (leaf) item
  if (type === 'unit') {
    const finalAccumulated = { ...accumulatedParts, unit: id };
    if (!accumulatedParts.group && activeSourceConfig && resolvedContext.bookId) {
      const book = activeSourceConfig.bookInfo?.[resolvedContext.bookId];
      if (book && book.units && !book.groups) {
        finalAccumulated.group = 'index';
      }
    }
    const unitLink = buildReadLink(finalAccumulated);
    const isUnitActive = resolvedContext.unitId === id && resolvedContext.bookId === accumulatedParts.book;
    const displayTitle = formatUnitTitle(nodeData as UnitInfo, resolvedContext.sourceId || accumulatedParts.source);

    return (
      <Link
        to={unitLink}
        className={`unit-item ${isUnitActive ? 'active' : ''}`}
        style={{ paddingLeft: `${pathParts.length * 0.75 + 1.25}rem` }}
        dangerouslySetInnerHTML={{ __html: displayTitle }}
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
          {type === 'section' && <Folder size={18} className="section-icon" style={{ flexShrink: 0, color: 'var(--accent-color)' }} />}
          {type === 'source' && <Book size={18} className="brand-icon" style={{ flexShrink: 0 }} />}
          {type === 'collection' && <Layers size={16} className="collection-icon" style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />}
          {type === 'book' && <BookOpen size={16} className="book-icon" style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />}
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
          {children.map(({ id: childId, type: childType }) => {
            const childData = getChildNodeData(childId, childType);
            if (!childData) return null;

            const nextAccumulated = { ...accumulatedParts };
            if (type === 'section') nextAccumulated.source = childId;
            if (type === 'source' && childType === 'collection') nextAccumulated.collection = childId;
            if (type === 'source' && childType === 'book') nextAccumulated.book = childId;
            if (type === 'collection') nextAccumulated.book = childId;
            if (type === 'book' && childType === 'group') nextAccumulated.group = childId;

            return (
              <SidebarNode
                key={childId}
                id={childId}
                title={(childData as any).title}
                type={childType}
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
        {/* Render sections if they exist in the library catalog */}
        {libraryIndex.sections && libraryIndex.sections.map((sectionId) => {
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
        })}

        {/* Render root-level unsectioned flat sources in the library catalog */}
        {libraryIndex.sources && libraryIndex.sources.map((sourceId) => {
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
        })}
      </div>
    </aside>
  );
};
